"use client"

import * as React from "react"
import { Dialog, DialogContent } from "@/components/ui/dialog"

interface ModalProps {
  open: boolean;
  onOpenChange?: (open: boolean) => void;
  children: React.ReactNode;
  className?: string;
}

export function Modal({ open, onOpenChange, children, className }: ModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={className ?? "max-w-xl"}>{children}</DialogContent>
    </Dialog>
  )
}

export default Modal
