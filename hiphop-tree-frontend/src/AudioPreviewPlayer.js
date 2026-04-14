import React, { useEffect, useRef, useState, useMemo } from 'react';

// ── AudioPreviewPlayer ────────────────────────────────────────────────────────
// Fixed bottom-right Sonic Link mini-player.
//
// Regional failover:
//   1. Tries preview_url_us first (primary)
//   2. On error → switches to preview_url_gb automatically
//   3. Both fail → shows YouTube / Spotify search fallback buttons
//
// Props:
//   audioMeta  — { track_name, preview_url_us?, preview_url_gb?,
//                  spotify_preview_url? [legacy] } | null
//   onDismiss  — callback to clear audio state in the parent

export default function AudioPreviewPlayer({ audioMeta, onDismiss }) {
  const audioRef    = useRef(null);
  const [isPlaying,  setIsPlaying]  = useState(false);
  const [volume,     setVolume]     = useState(0.8);
  const [progress,   setProgress]   = useState(0);
  const [isVisible,  setIsVisible]  = useState(false);
  const [urlIndex,   setUrlIndex]   = useState(0);  // which URL we're currently trying
  const [allFailed,  setAllFailed]  = useState(false);
  const progressRaf  = useRef(null);

  // Build ordered preview URL list from audioMeta.
  // US is primary (larger catalog), GB is fallback.
  // Legacy field names are also handled so old edges still work.
  const previewUrls = useMemo(() => {
    if (!audioMeta) return [];
    return [
      audioMeta.preview_url_us,
      audioMeta.preview_url_gb,
      audioMeta.spotify_preview_url,  // legacy — treated as US-equivalent
      audioMeta.itunes_preview_url,   // legacy — treated as GB-equivalent
    ].filter(Boolean);
  }, [audioMeta]);

  const currentUrl = previewUrls[urlIndex] ?? null;

  // ── Mount / track change ─────────────────────────────────────
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (!audioMeta || previewUrls.length === 0) {
      fadeOut(audio, () => {
        setIsPlaying(false);
        setIsVisible(false);
        setProgress(0);
        setAllFailed(false);
        setUrlIndex(0);
        cancelAnimationFrame(progressRaf.current);
      });
      return;
    }

    // New track — reset failover state
    setUrlIndex(0);
    setAllFailed(false);
    setProgress(0);
    setIsVisible(true);

    return () => cancelAnimationFrame(progressRaf.current);
  }, [audioMeta]); // eslint-disable-line

  // ── Load & play whenever currentUrl changes ──────────────────
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !currentUrl) return;

    audio.src    = currentUrl;
    audio.volume = volume;

    audio.play()
      .then(() => {
        setIsPlaying(true);
        startProgressTracking(audio);
      })
      .catch(err => {
        console.warn('[AudioPreviewPlayer] Autoplay blocked:', err.message);
        setIsPlaying(false);
      });
  }, [currentUrl]); // eslint-disable-line

  // ── Volume sync ───────────────────────────────────────────────
  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume;
  }, [volume]);

  const startProgressTracking = (audio) => {
    cancelAnimationFrame(progressRaf.current);
    const tick = () => {
      if (!audio.paused && audio.duration) {
        setProgress(audio.currentTime / audio.duration);
      }
      progressRaf.current = requestAnimationFrame(tick);
    };
    progressRaf.current = requestAnimationFrame(tick);
  };

  const fadeOut = (audio, onComplete) => {
    const STEPS = 20, INTERVAL = 20;
    let step = 0;
    const startVol = audio.volume;
    const fade = setInterval(() => {
      step++;
      audio.volume = Math.max(0, startVol * (1 - step / STEPS));
      if (step >= STEPS) {
        clearInterval(fade);
        audio.pause();
        audio.currentTime = 0;
        audio.volume = startVol;
        if (onComplete) onComplete();
      }
    }, INTERVAL);
  };

  // ── Regional failover ─────────────────────────────────────────
  // Called by the <audio> onError event. Tries the next URL in the
  // previewUrls list. If we've exhausted all options, shows fallbacks.
  const handleAudioError = () => {
    const nextIndex = urlIndex + 1;
    if (nextIndex < previewUrls.length) {
      const regionLabels = ['US', 'GB', 'legacy'];
      console.warn(
        `[AudioPreviewPlayer] URL[${urlIndex}] (${regionLabels[urlIndex] ?? 'fallback'}) failed — trying URL[${nextIndex}]`
      );
      setIsPlaying(false);
      cancelAnimationFrame(progressRaf.current);
      setUrlIndex(nextIndex);  // triggers the useEffect above
    } else {
      console.warn('[AudioPreviewPlayer] All preview URLs failed — showing fallback buttons');
      setIsPlaying(false);
      setAllFailed(true);
      cancelAnimationFrame(progressRaf.current);
    }
  };

  const handlePlayPause = () => {
    const audio = audioRef.current;
    if (!audio || allFailed) return;

    if (audio.paused) {
      audio.play().then(() => {
        setIsPlaying(true);
        startProgressTracking(audio);
      }).catch(handleAudioError);
    } else {
      audio.pause();
      setIsPlaying(false);
      cancelAnimationFrame(progressRaf.current);
    }
  };

  const handleEnded = () => {
    setIsPlaying(false);
    setProgress(1);
    cancelAnimationFrame(progressRaf.current);
  };

  const handleDismiss = () => {
    const audio = audioRef.current;
    if (audio) {
      fadeOut(audio, () => {
        setIsPlaying(false);
        setIsVisible(false);
        setProgress(0);
        setAllFailed(false);
        setUrlIndex(0);
      });
    }
    if (onDismiss) onDismiss();
  };

  const handleSeek = (e) => {
    const audio = audioRef.current;
    if (!audio || !audio.duration || allFailed) return;
    const ratio = (e.clientX - e.currentTarget.getBoundingClientRect().left) / e.currentTarget.offsetWidth;
    audio.currentTime = ratio * audio.duration;
    setProgress(ratio);
  };

  // ── Fallback search URLs ──────────────────────────────────────
  const trackName    = audioMeta?.track_name ?? '';
  const ytSearchUrl  = `https://www.youtube.com/results?search_query=${encodeURIComponent(trackName)}`;
  const spotifyUrl   = `https://open.spotify.com/search/${encodeURIComponent(trackName)}`;

  // ── Which region label is active ─────────────────────────────
  const regionLabel = (() => {
    if (!currentUrl) return null;
    if (currentUrl === audioMeta?.preview_url_us) return 'US';
    if (currentUrl === audioMeta?.preview_url_gb) return 'GB';
    return null;
  })();

  return (
    <>
      <audio
        ref={audioRef}
        onEnded={handleEnded}
        onError={handleAudioError}
        preload="metadata"
      />

      <div
        className={`sonic-player ${isVisible ? 'sonic-player--visible' : ''}`}
        role="region"
        aria-label="Sonic Link audio preview"
      >
        {/* Track name + region badge */}
        <div className="sonic-player__track">
          <span className="sonic-player__label">NOW PLAYING</span>
          <span className="sonic-player__name">{trackName || '—'}</span>
          {regionLabel && !allFailed && (
            <span className="sonic-player__region-badge">{regionLabel}</span>
          )}
        </div>

        {allFailed ? (
          /* ── All URLs failed: show search fallback buttons ── */
          <div className="sonic-player__fallback">
            <p className="sonic-player__fallback-msg">Preview unavailable in your region.</p>
            <div className="sonic-player__fallback-btns">
              <a
                href={ytSearchUrl}
                target="_blank"
                rel="noreferrer"
                className="sonic-player__fallback-btn sonic-player__fallback-btn--yt"
                title={`Search "${trackName}" on YouTube`}
              >
                ▶ YouTube
              </a>
              <a
                href={spotifyUrl}
                target="_blank"
                rel="noreferrer"
                className="sonic-player__fallback-btn sonic-player__fallback-btn--sp"
                title={`Search "${trackName}" on Spotify`}
              >
                ♪ Spotify
              </a>
              <button
                className="sonic-player__btn sonic-player__dismiss"
                onClick={handleDismiss}
                title="Close player"
              >
                ✕
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Progress bar */}
            <div
              className="sonic-player__progress-track"
              onClick={handleSeek}
              role="progressbar"
              aria-valuenow={Math.round(progress * 100)}
              aria-valuemin={0}
              aria-valuemax={100}
              title="Click to seek"
            >
              <div
                className="sonic-player__progress-fill"
                style={{ width: `${progress * 100}%` }}
              />
            </div>

            {/* Controls */}
            <div className="sonic-player__controls">
              <button
                className="sonic-player__btn sonic-player__playpause"
                onClick={handlePlayPause}
                title={isPlaying ? 'Pause' : 'Play'}
              >
                {isPlaying ? '⏸' : '▶'}
              </button>

              <div className="sonic-player__vol-wrap">
                <span className="sonic-player__vol-icon">🔈</span>
                <input
                  type="range"
                  className="sonic-player__volume"
                  min={0} max={1} step={0.05}
                  value={volume}
                  onChange={e => setVolume(parseFloat(e.target.value))}
                  aria-label="Volume"
                />
              </div>

              <button
                className="sonic-player__btn sonic-player__dismiss"
                onClick={handleDismiss}
                title="Close player"
              >
                ✕
              </button>
            </div>
          </>
        )}
      </div>
    </>
  );
}
