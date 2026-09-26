import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface EndDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onConfirm: () => void;
}

export function EndDialog({ open, onOpenChange, onConfirm }: EndDialogProps) {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>End the interview?</DialogTitle>
                    <DialogDescription>
                        Your interviewer will be told you're finished and the session will close. You can't resume it afterwards.
                    </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                        Keep going
                    </Button>
                    <Button variant="destructive" onClick={onConfirm}>
                        End interview
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
