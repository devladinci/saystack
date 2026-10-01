import { Icon } from "../Icon.js";

interface IProps {
  snippet: string;
  onCopyCode: () => void;
  onCopyLink: () => void;
}

export function ShareControls({ snippet, onCopyCode, onCopyLink }: IProps) {
  return (
    <section className="p-section">
      <h2 className="p-title">Use it</h2>
      <pre className="snippet">
        <code>{snippet}</code>
      </pre>
      <div className="p-actions">
        <button type="button" className="text-btn" onClick={onCopyCode}>
          <Icon name="code" size={14} />
          Copy code
        </button>
        <button type="button" className="text-btn" onClick={onCopyLink}>
          <Icon name="copy" size={14} />
          Copy link
        </button>
      </div>
      <p className="p-note">The link keeps every setting, so whoever opens it sees the same look.</p>
    </section>
  );
}
