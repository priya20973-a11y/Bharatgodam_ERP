# Cold Storage Accounting Guide

## Overview
This guide explains the new `Cold Storage Accounting` structure and how to use the module correctly.

The accounting hub is now grouped into 4 sections:

- `Masters`
- `Transactions`
- `Reports`
- `Settings`

These sections are available in the Cold Accounting home page under `/cold/accounting`.

---

## 1. Masters
Use this section to configure the accounting system.

### Chart of Accounts
- Manage account heads
- Account Name
- Account Code
- Parent Group
- Nature
- Opening Balance
- GST Applicable
- GST Rate
- TDS Applicable
- Ledger Status

### Financial Year
- FY Name
- Start Date
- End Date
- Lock Date
- Closing Balance Transfer

### GST Settings
- GSTIN
- State
- HSN/SAC
- Invoice Prefix
- CGST
- SGST
- IGST
- Reverse Charge

### Bank Accounts
- Account Name
- Bank
- IFSC
- Opening Balance
- QR Code
- UPI
- Cheque Prefix

---

## 2. Transactions
This is the voucher entry area.

### Payment Voucher
- Voucher No
- Date
- Expense Ledger
- Party
- Warehouse
- Amount
- GST
- Payment Mode
- Narration
- Attachment

### Receipt Voucher
- Voucher No
- Date
- Received From
- Income Ledger
- Warehouse
- Amount
- GST
- Payment Mode
- Reference

### Contra Voucher
- Cash to Bank
- Bank to Cash
- Bank to Bank

### Journal Voucher
- Debit Ledger
- Credit Ledger
- Amount
- Narration
- Cost Center
- Warehouse
- Commodity

### Sales Invoice
- Client
- Warehouse
- Commodity
- Storage Charges
- Electricity
- Labour
- Transport
- GST
- Discount
- Total

### Purchase Voucher
- Vendor
- Warehouse
- Expense Type
- GST
- Invoice Number
- Invoice Date
- Amount
- Payment Due

---

## 3. Reports
Use this section to run financial reports and statements.

### Dashboard
Current KPIs include:
- Today's Revenue
- Outstanding Receivables
- Outstanding Payables
- Cash Balance
- Bank Balance
- Electricity Expense
- Warehouse Profit
- Top Clients
- Monthly Revenue
- Income vs Expense
- Outstanding Rent
- Storage Occupancy
- Cold Room Revenue
- Revenue by Commodity

### Trial Balance
Columns:
- Ledger
- Debit
- Credit
- Closing Balance
- Difference

### Ledger
Filters:
- Warehouse
- Client
- Commodity
- Date
- Ledger
- Voucher Type

### Cash Book
Columns:
- Date
- Voucher
- Particulars
- Receipt
- Payment
- Balance

### Bank Book
Same as Cash Book plus reconciliation details.

### Profit & Loss
Compare results:
- Monthly
- Warehouse-wise
- Commodity-wise
- Client-wise
- Expense Head-wise

### Balance Sheet
Main categories:
- Assets
- Liabilities
- Capital
- Current Assets
- Current Liabilities
- Fixed Assets

### Day Book
Shows every accounting transaction with filters:
- Date
- Warehouse
- Voucher
- User

---

## 4. Cold Storage Specific Reports
These are priority warehouse-native reports.

### Client Outstanding
Columns:
- Client
- Invoice Amount
- Paid
- Pending
- Overdue Days
- Interest

### Warehouse Profitability
- Warehouse
- Revenue
- Electricity
- Labour
- Maintenance
- Net Profit

### Commodity Profitability
- Commodity
- Revenue
- Storage Cost
- Margin

### Electricity Recovery Report
- Electricity Bill
- Recovered from Clients
- Difference

### Chamber-wise Profitability
- Cold Room
- Revenue
- Expense
- Profit

### Rent Collection Report
- Client
- Rent
- Paid
- Pending
- Last Payment

### Security Deposit Register
- Client
- Deposit
- Adjusted
- Balance

### GST Report
- Sales GST
- Purchase GST
- Output Tax
- Input Tax
- Net GST

### TDS Report
- Vendor
- TDS
- Deducted
- Pending

---

## Accounting Automation
The goal is to auto-generate accounting entries when operational transactions happen.

Example flows:
- Client invoice generated → debit Accounts Receivable, credit Storage Rent / Labour / Electricity / GST Output
- Client payment → debit Bank, credit Accounts Receivable
- Electricity bill → debit Electricity Expense, credit Accounts Payable
- Vendor payment → debit Accounts Payable, credit Bank
- Salary → debit Salary Expense, credit Bank

---

## Cost Centers
Every voucher should support:
- Warehouse
- Chamber
- Commodity
- Client
- Cost Center
- Revenue Center
- Branch
- User

This enables profitability reporting at every level.

---

## How to use this now
1. Open `Cold Storage Accounting` from the cold sidebar.
2. Under `Masters`, configure the chart of accounts, financial year, GST, and bank accounts.
3. Under `Transactions`, record vouchers or review placeholders for future voucher screens.
4. Under `Reports`, inspect financial statements and books.
5. Use the dashboard and GST report pages as the first reporting views.

---

## Notes
- The UI now supports the new grouped layout and placeholder pages for missing voucher entry screens.
- Full Tally-like voucher forms and automation still need implementation in the new section routes.
- This guide is intended as the current module roadmap for extending the accounting feature.
