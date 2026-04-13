import React, { useEffect, useRef, useState } from 'react';

// ── AudioPreviewPlayer ────────────────────────────────────────────────────────
// Fixed bottom-right "Sonic Link" mini-player.
// Stays invisible until a relationship edge with audio_metadata is clicked.
// Uses the native HTML5 Audio API — no library overhead.
//
// Props:
//   audioMeta  — { track_name, spotify_preview_url, isrc } | null
//   onDismiss  — callback to clear audio state in the parent.

export default function AudioPreviewPlayer({ audioMeta, onDismiss }) {
  const audioRef     = useRef(null);
  const [isPlaying,  setIsPlaying]  = useState(false);
  const [volume,     setVolume]     = useState(0.8);
  const [progress,   setProgress]   = useState(0);     // 0–1
  const [isVisible,  setIsVisible]  = useState(false);
  const [audioError, setAudioError] = useState(false); // ← source validation flag
  const progressRaf  = useRef(null);

  // ── Mount / URL change ────────────────────────────────────────
  // New audioMeta → swap src, reset error state, auto-play.
  // null audioMeta → fade out and hide.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (!audioMeta) {
      fadeOut(audio, () => {
        setIsPlaying(false);
        setIsVisible(false);
        setProgress(0);
        setAudioError(false);
        cancelAnimationFrame(progressRaf.current);
      });
      return;
    }

    // New track — reset error state before loading fresh src
    setAudioError(false);
    audio.src    = audioMeta.spotify_preview_url || audioMeta.itunes_preview_url;
    audio.volume = volume;
    setProgress(0);
    setIsVisible(true);

    audio.play()
      .then(() => {
        setIsPlaying(true);
        startProgressTracking(audio);
      })
      .catch(err => {
        // Autoplay blocked by browser policy — show player in paused state
        console.warn('[AudioPreviewPlayer] Autoplay blocked:', err.message);
        setIsPlaying(false);
      });

    return () => {
      cancelAnimationFrame(progressRaf.current);
    };
  }, [audioMeta]); // eslint-disable-line

  // ── Volume sync ───────────────────────────────────────────────
  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume;
  }, [volume]);

  // ── Progress tracking (rAF) ───────────────────────────────────
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

  // ── Soft fade-out helper ──────────────────────────────────────
  const fadeOut = (audio, onComplete) => {
    const STEPS    = 20;
    const INTERVAL = 20;
    let   step     = 0;
    const startVol = audio.volume;

    const fade = setInterval(() => {
      step++;
      audio.volume = Math.max(0, startVol * (1 - step / STEPS));
      if (step >= STEPS) {
        clearInterval(fade);
        audio.pause();
        audio.currentTime = 0;
        audio.volume      = startVol;
        if (onComplete) onComplete();
      }
    }, INTERVAL);
  };

  // ── Source error handler ──────────────────────────────────────
  // Fires when the <audio> element can't load the src —
  // NotSupportedError, 404, CORS block, regional restriction, etc.
  // Instead of silent failure, we surface a clear message to the user.
  const handleAudioError = () => {
    console.warn('[AudioPreviewPlayer] Source failed to load:', audioRef.current?.src);
    setAudioError(true);
    setIsPlaying(false);
    cancelAnimationFrame(progressRaf.current);
  };

  // ── Play / Pause toggle ───────────────────────────────────────
  const handlePlayPause = () => {
    const audio = audioRef.current;
    if (!audio || audioError) return;

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

  // ── Track ended ────────────────────────────────────────────────
  const handleEnded = () => {
    setIsPlaying(false);
    setProgress(1);
    cancelAnimationFrame(progressRaf.current);
  };

  // ── Dismiss (X button) ─────────────────────────────────────────
  const handleDismiss = () => {
    const audio = audioRef.current;
    if (audio) {
      fadeOut(audio, () => {
        setIsPlaying(false);
        setIsVisible(false);
        setProgress(0);
        setAudioError(false);
      });
    }
    if (onDismiss) onDismiss();
  };

  // ── Progress bar click → seek ─────────────────────────────────
  const handleSeek = (e) => {
    const audio = audioRef.current;
    if (!audio || !audio.duration || audioError) return;
    const rect  = e.currentTarget.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    audio.currentTime = ratio * audio.duration;
    setProgress(ratio);
  };

  return (
    <>
      {/* Native HTML5 Audio — onError is the source validation safety net */}
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
        {/* Now Playing label */}
        <div className="sonic-player__track">
          <span className="sonic-player__label">NOW PLAYING</span>
          <span className="sonic-player__name">
            {audioMeta?.track_name ?? '—'}
          </span>
        </div>

        {/* ── Error state: regional / source failure ── */}
        {audioError ? (
          <div className="sonic-player__error">
            🌐 Preview unavailable in your region.
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

            {/* Controls row */}
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
                  min={0}
                  max={1}
                  step={0.05}
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

        {/* Dismiss is always reachable, even in error state */}
        {audioError && (
          <div className="sonic-player__controls">
            <button
              className="sonic-player__btn sonic-player__dismiss sonic-player__dismiss--error"
              onClick={handleDismiss}
              title="Close player"
            >
              ✕ Close
            </button>
          </div>
        )}
      </div>
    </>
  );
}
