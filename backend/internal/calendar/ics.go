// Package calendar emits an RFC 5545 iCalendar feed for rollouts so users can
// subscribe to it in Outlook / any CalDAV client. The feed is read-only and
// every authenticated user (including readonly) is allowed to fetch it.
package calendar

import (
	"fmt"
	"io"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/yourorg/releaseradar/internal/domain"
)

// WriteICS renders the rollouts as VEVENTs into w.
func WriteICS(w io.Writer, rollouts []domain.Rollout) error {
	bw := newFolder(w)
	bw.Line("BEGIN:VCALENDAR")
	bw.Line("VERSION:2.0")
	bw.Line("PRODID:-//ReleaseRadar//EN")
	bw.Line("CALSCALE:GREGORIAN")
	bw.Line("METHOD:PUBLISH")
	bw.Line("X-WR-CALNAME:ReleaseRadar Rollouts")
	bw.Line("X-WR-TIMEZONE:UTC")

	now := time.Now().UTC()
	for _, r := range rollouts {
		for i, st := range r.Stages {
			uid := fmt.Sprintf("%s-%d@releaseradar", r.ID, i)
			summary := fmt.Sprintf("[%s] %s — %s", st.Env, r.ProductID, r.Title)
			desc := r.DescExt
			start := st.StartAt.UTC()
			end := start.Add(st.Duration)
			if end.Before(start) || end.Equal(start) {
				end = start.Add(time.Hour)
			}
			bw.Line("BEGIN:VEVENT")
			bw.Line("UID:" + uid)
			bw.Line("DTSTAMP:" + iso(now))
			bw.Line("DTSTART:" + iso(start))
			bw.Line("DTEND:" + iso(end))
			bw.Line("SUMMARY:" + escape(summary))
			if desc != "" {
				bw.Line("DESCRIPTION:" + escape(desc))
			}
			bw.Line("STATUS:" + statusICS(st.Status))
			bw.Line("END:VEVENT")
		}
	}
	bw.Line("END:VCALENDAR")
	return bw.err
}

func iso(t time.Time) string { return t.Format("20060102T150405Z") }

func statusICS(s domain.StageStatus) string {
	switch s {
	case domain.StatusDone:
		return "CONFIRMED"
	case domain.StatusBlocked:
		return "CANCELLED"
	default:
		return "TENTATIVE"
	}
}

func escape(s string) string {
	r := strings.NewReplacer(
		`\`, `\\`,
		"\r\n", `\n`,
		"\r", `\n`,
		"\n", `\n`,
		",", `\,`,
		";", `\;`,
	)
	return r.Replace(s)
}

// folder wraps an io.Writer and applies the 75-octet line-folding rule from
// RFC 5545 §3.1.
type folder struct {
	w   io.Writer
	err error
}

func newFolder(w io.Writer) *folder { return &folder{w: w} }

func (f *folder) Line(s string) {
	if f.err != nil {
		return
	}
	for i, chunk := range splitLine(s, 73) {
		if i == 0 {
			f.write(chunk + "\r\n")
		} else {
			f.write(" " + chunk + "\r\n")
		}
	}
}

func (f *folder) write(s string) {
	if f.err != nil {
		return
	}
	_, f.err = io.WriteString(f.w, s)
}

// splitLine folds s into chunks of at most n octets, but never cuts in the
// middle of a multi-byte UTF-8 rune. RFC 5545 §3.1 counts octets (not runes)
// against the 75-octet line limit, so we back the cut up to the nearest rune
// boundary; the resulting chunk is therefore ≤ n octets and always valid UTF-8.
func splitLine(s string, n int) []string {
	if len(s) <= n {
		return []string{s}
	}
	var out []string
	for len(s) > n {
		cut := n
		// Back up while we'd land in the middle of a rune (continuation byte).
		for cut > 0 && !utf8.RuneStart(s[cut]) {
			cut--
		}
		// Degenerate guard: a single rune longer than n octets (can't happen
		// for valid UTF-8 with n≥4, but stay safe) — emit at least one octet.
		if cut == 0 {
			cut = n
		}
		out = append(out, s[:cut])
		s = s[cut:]
	}
	out = append(out, s)
	return out
}
