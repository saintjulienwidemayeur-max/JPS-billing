"use client";
import type { ComponentProps } from "react";
// A submit button that asks "are you sure?" first (an e-mail cannot be taken back).
// `plain`: a text link style (red underlined) for small destructive buttons, instead of the blue button.
export function ConfirmSubmit({ message, plain, className = "", ...p }: { message: string; plain?: boolean } & ComponentProps<"button">) {
  return <button type="submit" onClick={(e) => { if (!confirm(message)) e.preventDefault(); }} className={plain ? `text-red-700 underline ${className}` : `inline-flex h-9 items-center justify-center rounded-md bg-brand px-4 text-sm font-medium text-white hover:opacity-90 disabled:pointer-events-none disabled:opacity-50 ${className}`} {...p} />;
}
