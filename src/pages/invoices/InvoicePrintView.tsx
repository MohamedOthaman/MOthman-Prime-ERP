// src/pages/invoices/InvoicePrintView.tsx
// Print-optimized invoice layout for 3-copy dot-matrix / colored paper

import { forwardRef } from "react";

export interface PrintLineItem {
  line_no: number;
  item_code: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  discount: number;
  line_total: number;
}

export interface InvoicePrintData {
  invoice_no: string;
  invoice_date: string;
  customer_name: string;
  customer_code: string;
  salesman_name: string;
  salesman_code: string;
  notes: string;
  lines: PrintLineItem[];
  total_amount: number;
}

const InvoicePrintView = forwardRef<HTMLDivElement, { data: InvoicePrintData }>(
  ({ data }, ref) => {
    return (
      <div ref={ref} className="invoice-print-root">
        {/* Company Header */}
        <div className="invoice-print-company">
          <h1>FOOD CHOICE</h1>
          <p>General Trading & Food Stuff Co.</p>
        </div>

        <h2 className="invoice-print-title">SALES INVOICE</h2>

        {/* Header Info */}
        <div className="invoice-print-header">
          <div className="invoice-print-header-left">
            <div className="invoice-print-field">
              <span className="invoice-print-label">Invoice No:</span>
              <span className="invoice-print-value">{data.invoice_no}</span>
            </div>
            <div className="invoice-print-field">
              <span className="invoice-print-label">Date:</span>
              <span className="invoice-print-value">{data.invoice_date}</span>
            </div>
          </div>
          <div className="invoice-print-header-right">
            <div className="invoice-print-field">
              <span className="invoice-print-label">Customer:</span>
              <span className="invoice-print-value">
                {data.customer_code} — {data.customer_name}
              </span>
            </div>
            <div className="invoice-print-field">
              <span className="invoice-print-label">Salesman:</span>
              <span className="invoice-print-value">
                {data.salesman_code ? `${data.salesman_code} — ${data.salesman_name}` : data.salesman_name || "—"}
              </span>
            </div>
          </div>
        </div>

        {/* Lines table */}
        <table className="invoice-print-table">
          <thead>
            <tr>
              <th className="invoice-print-th-no">#</th>
              <th className="invoice-print-th-code">Code</th>
              <th className="invoice-print-th-desc">Description</th>
              <th className="invoice-print-th-qty">Qty</th>
              <th className="invoice-print-th-price">Price</th>
              <th className="invoice-print-th-disc">Disc.</th>
              <th className="invoice-print-th-total">Total</th>
            </tr>
          </thead>
          <tbody>
            {data.lines.map((line) => (
              <tr key={line.line_no}>
                <td className="invoice-print-td-center">{line.line_no}</td>
                <td>{line.item_code}</td>
                <td>{line.product_name}</td>
                <td className="invoice-print-td-right">{line.quantity.toFixed(3)}</td>
                <td className="invoice-print-td-right">{line.unit_price.toFixed(3)}</td>
                <td className="invoice-print-td-right">{line.discount.toFixed(3)}</td>
                <td className="invoice-print-td-right">{line.line_total.toFixed(3)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Totals */}
        <div className="invoice-print-totals">
          <div className="invoice-print-totals-row">
            <span className="invoice-print-totals-label">Total Amount:</span>
            <span className="invoice-print-totals-value">{data.total_amount.toFixed(3)} KWD</span>
          </div>
        </div>

        {/* Notes */}
        {data.notes && (
          <div className="invoice-print-notes">
            <span className="invoice-print-label">Notes:</span> {data.notes}
          </div>
        )}

        {/* Footer */}
        <div className="invoice-print-footer">
          <div className="invoice-print-sig">
            <div className="invoice-print-sig-line"></div>
            <span>Prepared By</span>
          </div>
          <div className="invoice-print-sig">
            <div className="invoice-print-sig-line"></div>
            <span>Received By</span>
          </div>
          <div className="invoice-print-sig">
            <div className="invoice-print-sig-line"></div>
            <span>Driver</span>
          </div>
        </div>
      </div>
    );
  }
);

InvoicePrintView.displayName = "InvoicePrintView";

export default InvoicePrintView;
