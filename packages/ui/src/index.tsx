import { forwardRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";

const join = (...classes: Array<string | undefined | false>) => classes.filter(Boolean).join(" ");

export function Button({ className, variant = "secondary", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost" }) {
  return <button className={join("tb-button", `tb-button--${variant}`, className)} {...props} />;
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(({ className, ...props }, ref) => {
  return <input ref={ref} className={join("tb-input", className)} {...props} />;
});
Input.displayName = "Input";

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(({ className, ...props }, ref) => {
  return <textarea ref={ref} className={join("tb-textarea", className)} {...props} />;
});
Textarea.displayName = "Textarea";

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(({ className, ...props }, ref) => {
  return <select ref={ref} className={join("tb-select", className)} {...props} />;
});
Select.displayName = "Select";

export function Panel({ className, children }: { className?: string; children: ReactNode }) {
  return <section className={join("tb-panel", className)}>{children}</section>;
}

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "green" | "blue" | "amber" }) {
  return <span className={`tb-badge tb-badge--${tone}`}>{children}</span>;
}
