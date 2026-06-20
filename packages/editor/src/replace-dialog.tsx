import { WarningCircle, X } from "@phosphor-icons/react";
import { Button } from "@titanbase/ui";

interface ReplaceDialogProps {
  onReplace: () => void;
  onCancel: () => void;
}

export function ReplaceDialog({ onReplace, onCancel }: ReplaceDialogProps) {
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onCancel(); }}>
    <section className="replace-modal" role="alertdialog" aria-modal="true" aria-labelledby="replace-title">
      <header><div><span>Unsaved changes</span><h2 id="replace-title">Replace current schema?</h2></div><button className="modal-close" aria-label="Cancel replacing schema" onClick={onCancel}><X size={18} /></button></header>
      <p><WarningCircle size={17} /> Your unsaved changes will be discarded when another schema is opened.</p>
      <footer><Button onClick={onCancel}>Cancel</Button><Button variant="primary" onClick={onReplace}>Discard and continue</Button></footer>
    </section>
  </div>;
}
