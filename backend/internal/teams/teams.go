// Package teams posts Adaptive Cards to Microsoft Teams Workflow webhooks.
// Legacy "Office 365 Connectors" webhooks were retired in 2026 — this code
// targets the Power Automate / Workflows incoming webhook format only.
package teams

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"time"

	"github.com/yourorg/releaseradar/internal/config"
	"github.com/yourorg/releaseradar/internal/domain"
)

type Client struct {
	cfg   config.TeamsConfig
	httpc *http.Client
}

func NewClient(cfg config.TeamsConfig) *Client {
	return &Client{cfg: cfg, httpc: &http.Client{Timeout: 10 * time.Second}}
}

// AnnounceStage posts a rollout-stage announcement to the channel that matches
// the stage's announce policy. Channel selection follows the stage metadata
// from the shared "stage" table (TMS_NP for non-prod, TMS_PROD for prod*).
func (c *Client) AnnounceStage(ctx context.Context, channel string, r domain.Rollout, stage domain.RolloutStage, advance time.Duration) error {
	url := c.webhookFor(channel)
	if url == "" {
		return fmt.Errorf("no webhook configured for channel %q", channel)
	}

	advanceLabel := humanAdvance(advance)
	title := fmt.Sprintf("Rollout %s — %s in %s", r.Title, stage.Env, advanceLabel)

	card := adaptiveCard(title, []block{
		factSet([]fact{
			{Title: "Product", Value: r.ProductID},
			{Title: "Stage", Value: stage.Env},
			{Title: "Window", Value: stage.StartAt.UTC().Format(time.RFC1123)},
			{Title: "Duration", Value: stage.Duration.String()},
			{Title: "Pair", Value: joinNonEmpty(r.Pair)},
		}),
		textBlock(r.DescExt, false),
	})
	env := message{
		Type: "message",
		Attachments: []attachment{{
			ContentType: "application/vnd.microsoft.card.adaptive",
			Content:     card,
		}},
	}
	body, err := json.Marshal(env)
	if err != nil {
		return err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := c.httpc.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		b, _ := io.ReadAll(io.LimitReader(resp.Body, 1024))
		return fmt.Errorf("teams webhook %d: %s", resp.StatusCode, string(b))
	}
	return nil
}

func (c *Client) webhookFor(channel string) string {
	switch channel {
	case "TMS_NP":
		return c.cfg.WebhookNonProd
	case "TMS_PROD":
		return c.cfg.WebhookProd
	}
	return ""
}

// --- payload shapes ---

type message struct {
	Type        string       `json:"type"`
	Attachments []attachment `json:"attachments"`
}

type attachment struct {
	ContentType string         `json:"contentType"`
	ContentURL  any            `json:"contentUrl"`
	Content     map[string]any `json:"content"`
}

type block map[string]any
type fact struct{ Title, Value string }

func adaptiveCard(title string, body []block) map[string]any {
	return map[string]any{
		"$schema": "http://adaptivecards.io/schemas/adaptive-card.json",
		"type":    "AdaptiveCard",
		"version": "1.5",
		"body": append([]block{
			{
				"type":   "TextBlock",
				"size":   "Large",
				"weight": "Bolder",
				"text":   title,
				"wrap":   true,
			},
		}, body...),
	}
}

func factSet(facts []fact) block {
	out := make([]map[string]string, 0, len(facts))
	for _, f := range facts {
		if f.Value == "" {
			continue
		}
		out = append(out, map[string]string{"title": f.Title, "value": f.Value})
	}
	return block{"type": "FactSet", "facts": out}
}

func textBlock(s string, mono bool) block {
	b := block{"type": "TextBlock", "text": s, "wrap": true}
	if mono {
		b["fontType"] = "Monospace"
	}
	return b
}

func humanAdvance(d time.Duration) string {
	if d >= 7*24*time.Hour {
		return fmt.Sprintf("%dw", int(d/(7*24*time.Hour)))
	}
	if d >= 24*time.Hour {
		return fmt.Sprintf("%dd", int(d/(24*time.Hour)))
	}
	return fmt.Sprintf("%dh", int(d/time.Hour))
}

func joinNonEmpty(xs []string) string {
	out := ""
	for _, s := range xs {
		if s == "" {
			continue
		}
		if out != "" {
			out += ", "
		}
		out += s
	}
	return out
}

// Sentinel — used by tests to detect "not configured" mode.
var ErrUnconfigured = errors.New("teams webhook not configured")
