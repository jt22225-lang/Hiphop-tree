import React, { useEffect, useRef, useState } from 'react';

// ── AudioPreviewPlayer ────────────────────────────────────────────────────────
// Fixed bottom-right "Sonic Link" mini-player.
// Stays invisible (display:none) until a relationship edge with audio_metadata
// is clicked. Uses the native HTML5 Audio API — no library overhead.
//
// Think of it like a hidden radio that only turns on when you find the right
// frequency: dead silent until the user discovers a link with sound attached.
//
// Props:
//   audioMeta  — { track_name, spotify_preview_url, isrc } | null
//                Passed from App when an audio-enabled edge is clicked.
//   onDismiss  — callback to clear the audio state from the parent.

export default function AudioPreviewPlayer({ audioMeta, onDismiss }) {
  const audioRef  = useRef(null);
  const [isPlaying,  setIsPlaying]  = useState(false);
  const [volume,     setVolume]     = useState(0.8);
  const [progress,   setProgress]   = useState(0);   // 0–1
  const [isVisible,  setIsVisible]  = useState(false);
  const progressRaf  = useRef(null);

  // ── Mount / URL change ────────────────────────────────────────
  // Whenever a new audioMeta lands, swap the src and auto-play.
  // If audioMeta is cleared (null), fade out and reset.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (!audioMeta) {
      // Fade to silence — a slow release, like the end of a record
      fadeOut(audio, () => {
        setIsPlaying(false);
        setIsVisible(false);
        setProgress(0);
        cancelAnimationFrame(progressRaf.current);
      });
      return;
    }

    // New track incoming — treat it like dropping a needle on a fresh side
    audio.src    = audioMeta.spotify_preview_url;
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
  // Ramps volume from current → 0 over ~400ms, then pauses.
  const fadeOut = (audio, onComplete) => {
    const STEPS    = 20;
    const INTERVAL = 20; // ms — 400ms total
    let   step     = 0;
    const startVol = audio.volume;

    const fade = setInterval(() => {
      step++;
      audio.volume = Math.max(0, startVol * (1 - step / STEPS));
      if (step >= STEPS) {
        clearInterval(fade);
        audio.pause();
        audio.currentTime = 0;
        audio.volume      = startVol; // restore for next play
        if (onComplete) onComplete();
      }
    }, INTERVAL);
  };

  // ── Play / Pause toggle ───────────────────────────────────────
  const handlePlayPause = () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (audio.paused) {
      audio.play().then(() => {
        setIsPlaying(true);
        startProgressTracking(audio);
      });
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
      });
    }
    if (onDismiss) onDismiss();
  };

  // ── Progress bar click → seek ─────────────────────────────────
  const handleSeek = (e) => {
    const audio = audioRef.current;
    if (!audio || !audio.duration) return;
    const rect  = e.currentTarget.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    audio.currentTime = ratio * audio.duration;
    setProgress(ratio);
  };

  return (
    <>
      {/* Native HTML5 Audio element — invisible, low-overhead */}
      <audio ref={audioRef} onEnded={handleEnded} preload="metadata" />

      {/* ── Player UI — only mounted in DOM while visible ── */}
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
          {/* Play / Pause */}
          <button
            className="sonic-player__btn sonic-player__playpause"
            onClick={handlePlayPause}
            title={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? '⏸' : '▶'}
          </button>

          {/* Volume slider */}
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

          {/* Dismiss */}
          <button
            className="sonic-player__btn sonic-player__dismiss"
            onClick={handleDismiss}
            title="Close player"
          >
            ✕
          </button>
        </div>
      </div>
    </>
  );
}
