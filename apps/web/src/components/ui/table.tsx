import * as React from "react";
import { cn } from "@/lib/utils";

const Table = React.forwardRef<HTMLTableElement, React.HTMLAttributes<HTMLTableElement>>(({ className, ...props }, ref) => (
  <div className="w-full overflow-x-auto rounded-md border border-border">
    <table ref={ref} className={cn("w-full caption-bottom text-sm", className)} {...props} />
  </div>
));
Table.displayName = "Table";

const TableHeader = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, ...props }, ref) => <thead ref={ref} className={cn("bg-secondary/50", className)} {...props} />,
);
TableHeader.displayName = "TableHeader";

const TableBody = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, ...props }, ref) => <tbody ref={ref} className={cn("divide-y divide-border", className)} {...props} />,
);
TableBody.displayName = "TableBody";

// For a subtotal/totals row under a table's body — visually distinct
// (border above, slightly filled background, bold) so it doesn't read as
// just another data row.
const TableFooter = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, ...props }, ref) => <tfoot ref={ref} className={cn("border-t-2 border-border bg-secondary/40 font-semibold", className)} {...props} />,
);
TableFooter.displayName = "TableFooter";

const TableRow = React.forwardRef<HTMLTableRowElement, React.HTMLAttributes<HTMLTableRowElement>>(
  ({ className, ...props }, ref) => (
    <tr ref={ref} className={cn("transition-colors hover:bg-secondary/30", className)} {...props} />
  ),
);
TableRow.displayName = "TableRow";

const TableHead = React.forwardRef<HTMLTableCellElement, React.ThHTMLAttributes<HTMLTableCellElement>>(
  ({ className, ...props }, ref) => (
    <th
      ref={ref}
      // text-start (not text-left): a logical property so this follows the
      // document's direction, same as TableCell (which has no explicit
      // text-align and inherits the browser's per-direction default). With
      // a hardcoded text-left, headers stayed pinned left under dir="rtl"
      // while the data cells beneath them followed the RTL default
      // (right/"start") — headers and their columns visually didn't line
      // up in Arabic. This affected every table in the app, not just the
      // two screens it was reported on.
      className={cn("h-10 px-4 text-start align-middle text-xs font-medium uppercase tracking-wide text-muted-foreground", className)}
      {...props}
    />
  ),
);
TableHead.displayName = "TableHead";

const TableCell = React.forwardRef<HTMLTableCellElement, React.TdHTMLAttributes<HTMLTableCellElement>>(
  ({ className, ...props }, ref) => <td ref={ref} className={cn("px-4 py-3 align-middle", className)} {...props} />,
);
TableCell.displayName = "TableCell";

export { Table, TableHeader, TableBody, TableFooter, TableRow, TableHead, TableCell };
