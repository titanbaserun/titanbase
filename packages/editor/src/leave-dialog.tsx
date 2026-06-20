import { DownloadSimple, SignOut, X } from "@phosphor-icons/react";
import { Button } from "@titanbase/ui";

interface LeaveDialogProps {
  onSaveAndLeave: () => void;
  onLeave: () => void;
  onCancel: () => void;
}

export function LeaveDialog({ onSaveAndLeave, onLeave, onCancel }: LeaveDialogProps) {
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onCancel(); }}>
    <section className="leave-modal" role="alertdialog" aria-modal="true" aria-labelledby="leave-title" aria-describedby="leave-description">
      <header><div><span>Unsaved changes</span><h2 id="leave-title">Save schema before leaving?</h2></div><button className="modal-close" aria-label="Cancel leaving" onClick={onCancel}><X size={18} /></button></header>
      <p id="leave-description">You have unsaved changes. Save your current schema before returning to the start screen.</p>
      <footer><Button onClick={onCancel}>Cancel</Button><Button onClick={onLeave}><SignOut size={16} /> Leave without saving</Button><Button variant="primary" onClick={onSaveAndLeave}><DownloadSimple size={16} /> Save and leave</Button></footer>
    </section>
  </div>;
}
