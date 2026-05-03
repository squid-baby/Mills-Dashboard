import { useEffect, useRef, useState } from 'react';

const STAGE_LABEL = {
  cleaned:   { verb: 'Cleaned',   action: 'Mark Cleaned',   placeholder: 'Anything you noticed during the clean? (optional)' },
  finalized: { verb: 'Finalized', action: 'Mark Finalized', placeholder: 'Any final notes before handing the property back? (optional)' },
};

/**
 * TurnoverStageModal — captures optional notes while marking a turnover stage
 * (cleaned or finalized) on the latest inspection. Mirrors the backdrop/animation
 * pattern from src/components/calendar/TaskCreateModal.jsx.
 *
 * Behavior:
 *   - First click (alreadySet=false): primary button reads "Mark <Stage>".
 *     Save fires the notification email (silent on the user — they just see
 *     the button morph in the parent).
 *   - Re-edit (alreadySet=true): primary button reads "Save changes" and the
 *     save is silent (DB updates, no email). A small "Save & resend email"
 *     link offers the explicit escape hatch.
 *   - Empty notes are allowed (some cleans have nothing to flag).
 *   - Esc / backdrop click cancels.
 *
 * Props:
 *   stage         'cleaned' | 'finalized'
 *   initialNotes  current notes (pre-fills the textarea on re-edit)
 *   alreadySet    true when the stage is already recorded — switches button copy
 *   warningText   optional inline warning (e.g. "Cleaned hasn't been recorded yet")
 *   accentColor   theme accent for the primary button (matches parent group)
 *   onSave        async (notes, { forceEmail }) => void; throws to keep modal open
 *   onClose       () => void
 */
export default function TurnoverStageModal({
  stage, initialNotes = '', alreadySet = false, warningText = null,
  accentColor, onSave, onClose,
}) {
  const cfg = STAGE_LABEL[stage];
  const [notes, setNotes] = useState(initialNotes || '');
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  const textareaRef = useRef(null);

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape' && !saving) onClose(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, saving]);

  useEffect(() => {
    // Light autofocus into the notes box so workers can start typing immediately
    if (textareaRef.current) textareaRef.current.focus();
  }, []);

  async function doSave({ forceEmail }) {
    if (saving) return;
    setSaving(true);
    setErrorMsg(null);
    try {
      await onSave(notes.trim(), { forceEmail });
      onClose();
    } catch (err) {
      setErrorMsg(err?.message || 'Save failed. Try again?');
      setSaving(false);
    }
  }

  const primaryLabel = alreadySet ? 'Save changes' : cfg.action;

  return (
    <div
      onClick={() => !saving && onClose()}
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.7)',
        backdropFilter: 'blur(6px)',
        zIndex: 70,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        animation: 'fadeIn 200ms ease',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-default)',
          borderRadius: 'var(--radius-lg)',
          padding: 24,
          width: 440, maxWidth: '95vw',
          boxShadow: 'var(--shadow-lg)',
          maxHeight: '90vh', overflowY: 'auto',
        }}
      >
        <h2 style={{ fontSize: 16, fontWeight: 800, marginBottom: 6, color: 'var(--text-primary)' }}>
          {alreadySet ? `Update ${cfg.verb.toLowerCase()} notes` : `Mark ${cfg.verb}`}
        </h2>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 14 }}>
          {alreadySet
            ? 'Save changes will update the notes silently. Use the resend link below if you want to re-notify the team.'
            : 'Add any notes for the team. The team will get an email when you save.'}
        </div>

        {warningText && (
          <div style={{
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border-default)',
            borderRadius: 'var(--radius-sm)',
            padding: '8px 10px', marginBottom: 12,
            fontSize: 12, color: 'var(--text-muted)',
          }}>
            ⚠ {warningText}
          </div>
        )}

        <label style={{
          display: 'block',
          fontSize: 11, fontWeight: 700, color: 'var(--text-muted)',
          textTransform: 'uppercase', letterSpacing: '0.05em',
          marginBottom: 6,
        }}>
          Notes
        </label>
        <textarea
          ref={textareaRef}
          rows={5}
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder={cfg.placeholder}
          disabled={saving}
          style={{
            width: '100%',
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border-default)',
            borderRadius: 'var(--radius-sm)',
            padding: '10px 12px',
            color: 'var(--text-primary)',
            fontSize: 13, fontFamily: 'inherit',
            outline: 'none',
            resize: 'vertical',
          }}
        />

        {errorMsg && (
          <div style={{
            marginTop: 10,
            color: '#dc2626', fontSize: 12, fontWeight: 600,
          }}>
            {errorMsg}
          </div>
        )}

        <div style={{
          marginTop: 18,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: 10,
        }}>
          <button
            onClick={() => !saving && onClose()}
            disabled={saving}
            style={{
              background: 'transparent',
              color: 'var(--text-muted)',
              border: '1px solid var(--border-default)',
              borderRadius: 'var(--radius-sm)',
              padding: '8px 14px',
              fontSize: 13, fontWeight: 600,
              cursor: saving ? 'not-allowed' : 'pointer',
            }}
          >
            Cancel
          </button>

          <button
            onClick={() => doSave({ forceEmail: false })}
            disabled={saving}
            style={{
              background: accentColor || 'var(--text-primary)',
              color: '#000',
              border: 'none',
              borderRadius: 'var(--radius-sm)',
              padding: '8px 16px',
              fontSize: 13, fontWeight: 700,
              cursor: saving ? 'wait' : 'pointer',
              opacity: saving ? 0.7 : 1,
            }}
          >
            {saving ? 'Saving…' : primaryLabel}
          </button>
        </div>

        {alreadySet && (
          <div style={{
            marginTop: 12,
            textAlign: 'right',
            fontSize: 12,
          }}>
            <button
              onClick={() => doSave({ forceEmail: true })}
              disabled={saving}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--text-muted)',
                textDecoration: 'underline',
                fontSize: 12,
                cursor: saving ? 'not-allowed' : 'pointer',
                padding: 0,
              }}
            >
              Save &amp; resend email
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
