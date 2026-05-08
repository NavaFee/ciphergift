/**
 * Encrypted-text mosaic. Renders a shimmering gradient blob with an
 * optional label tag like "enc". Drop-in replacement wherever the design
 * shows ciphertext.
 */

interface CipherProps {
  width?: number;
  label?: string;
}

export function Cipher({ width = 60, label = "enc" }: CipherProps) {
  return (
    <span className="cipher">
      <span className="cipher-blob" style={{ width }} />
      {label && <span className="cipher-tag">{label}</span>}
    </span>
  );
}
