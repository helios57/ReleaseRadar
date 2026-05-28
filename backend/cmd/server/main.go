package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/yourorg/releaseradar/internal/api"
	"github.com/yourorg/releaseradar/internal/auth"
	"github.com/yourorg/releaseradar/internal/config"
	"github.com/yourorg/releaseradar/internal/hub"
	"github.com/yourorg/releaseradar/internal/ldap"
	"github.com/yourorg/releaseradar/internal/notify"
	"github.com/yourorg/releaseradar/internal/store"
	"github.com/yourorg/releaseradar/internal/teams"
)

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelInfo}))
	slog.SetDefault(logger)

	cfg, err := config.Load()
	if err != nil {
		logger.Error("config load failed", "err", err)
		os.Exit(1)
	}

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	db, err := store.OpenPostgres(ctx, cfg.DatabaseURL)
	if err != nil {
		logger.Error("db open failed", "err", err)
		os.Exit(1)
	}
	defer db.Close()

	if err := store.Migrate(ctx, db); err != nil {
		logger.Error("db migrate failed", "err", err)
		os.Exit(1)
	}

	repo := store.NewRepository(db)

	if cfg.SeedOnStart {
		if err := store.SeedIfEmpty(ctx, repo); err != nil {
			logger.Error("seed failed", "err", err)
		} else {
			logger.Info("seed applied")
		}
	}

	oidc, err := auth.NewOIDC(ctx, cfg.OIDC)
	if err != nil {
		logger.Error("oidc init failed", "err", err)
		os.Exit(1)
	}

	ldapResolver := ldap.NewResolver(cfg.LDAP)
	sessions := auth.NewSessionStore(cfg.SessionSecret)

	teamsClient := teams.NewClient(cfg.Teams)
	scheduler := notify.NewScheduler(repo, teamsClient, logger, cfg.Notify.Tick)
	go scheduler.Run(ctx)

	liveHub := hub.New()

	mux := api.NewRouter(api.Deps{
		Repo:      repo,
		OIDC:      oidc,
		LDAP:      ldapResolver,
		Sessions:  sessions,
		Hub:       liveHub,
		Logger:    logger,
		PublicURL: cfg.PublicURL,
	})

	srv := &http.Server{
		Addr:              cfg.ListenAddr,
		Handler:           mux,
		ReadHeaderTimeout: 5 * time.Second,
	}

	go func() {
		logger.Info("listening", "addr", cfg.ListenAddr)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			logger.Error("server error", "err", err)
			stop()
		}
	}()

	<-ctx.Done()
	logger.Info("shutting down")
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	_ = srv.Shutdown(shutdownCtx)
}
