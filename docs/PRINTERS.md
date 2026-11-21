# Receipt printers and barcode scanners

The desktop app prints receipts on thermal roll printers (Xprinter XP-58 and
XP-80 class, 58 mm and 80 mm rolls) and accepts any USB or Bluetooth barcode
scanner that behaves like a keyboard.

## Receipt printers

### Supported hardware

- Xprinter XP-58IIH, XP-80C and similar 58 mm / 76 mm / 80 mm thermal printers.
- Any printer installed in Windows with a vendor driver (Epson TM-T20, generic
  80 mm POS printers, etc.).
- USB is recommended. Bluetooth printers work when Windows exposes them as a
  printer with a serial port driver.

Install the printer's Windows driver first and print a test page from Windows
**Settings → Bluetooth & devices → Printers & scanners**. If Windows cannot
print to it, the app cannot either.

### Configure it in the app

1. Open **Settings → Receipt printer**.
2. Press **Find printers** (the list comes from Windows).
3. Choose the printer, or leave **Windows default printer**.
4. Choose the roll width: **58 mm**, **76 mm** or **80 mm**.
5. Set copies per receipt (1–3).
6. Leave **Print the receipt automatically after each sale** ticked.
7. Press **Test print**.

Settings are stored per Windows user on that computer, so each till can use a
different printer and paper width.

### Kitchen order tickets

For kitchens, tick **Print a kitchen order ticket after each sale** and, when
the kitchen has its own printer, pick it under **Kitchen printer** (leave it on
**Same as receipt printer** otherwise).

- The ticket contains the receipt number, time, order type (Dine-in /
  Takeaway / Delivery), table, waiter and quantity × item — no prices.
- It prints after the customer receipt, uses the same roll width, and one copy
  is always sent.
- If the kitchen printer fails, the ticket opens in the system print dialog
  instead so the order is not lost.

### How printing works

- After each completed sale the receipt is rendered as HTML at the configured
  width and sent to the printer through a hidden window with
  `silent: true` — no Windows print dialog.
- If the driver rejects the custom page size, the app retries once with the
  driver's default paper size.
- If printing still fails, the receipt opens in the system print dialog so the
  cashier can print it manually. The error is shown under the sale receipt.
- **Print receipt** on the sale-complete dialog and in **Sales history** always
  prints to the configured printer, with the same fallback.

### LAN mode

Printing is a local operation. In LAN-client mode each till sends print jobs to
its own printer, while sales still go to the shared server. The printer is not
shared over the network.

### Troubleshooting

| Symptom                               | Check                                                           |
| ------------------------------------- | --------------------------------------------------------------- |
| Printer list is empty                 | Install the driver, then press **Find printers**.               |
| Receipt prints but is cut on the side | Set the roll width to match the paper (58 vs 80 mm).            |
| Very small / very large text          | Paper width controls the font size; 58 mm uses a smaller font.  |
| "The printer rejected the job"        | Print a Windows test page; check the printer is online.         |
| Blank pages between receipts          | Set the printer's paper setting to the roll size in its driver. |

## Barcode scanners

### Supported scanners

Any keyboard-wedge scanner works with no setup: USB or Bluetooth guns that type
the barcode and press Enter (the factory default on most models). This includes
Xprinter's scanner range and generic EAN/UPC scanners.

Scanner suggestions:

- Use USB mode (HID keyboard), not a proprietary serial mode.
- Keep the suffix/terminator set to **Enter** (CR). The app treats Enter as
  "finish the scan".
- Do not enable a prefix unless it is a normal character; the app matches the
  scanned text exactly against the product barcode and SKU.

### Using it on the Sell screen

- Point the scanner at a barcode with nothing focused: the burst of keystrokes
  is recognised, the product is added to the cart, and a short beep confirms.
- Scanning into the product search box works too: Enter first tries an exact
  barcode/SKU match, then falls back to adding the first search result.
- Scanning the same product again increases its quantity.
- A failed scan plays a lower beep and shows "No active product matches …".
- Scans are ignored while the payment or sales-history dialog is open.

### Matching rules

- Match is exact on `barcode` **or** `sku` (trimmed, case-sensitive).
- Only active products can be added.
- Duplicate barcodes are rejected when you save a product, so a scan always
  resolves to one product.
- Barcodes can be typed manually in **Products → Edit** or generated with the
  EAN-13 button.

### Troubleshooting

| Symptom                     | Check                                                              |
| --------------------------- | ------------------------------------------------------------------ |
| Scanner types into the page | Click the Sell screen or the search box first; no dialog open.     |
| Product not added           | The barcode stored on the product must equal the scanned text.     |
| Wrong product added         | Two products share that barcode; make barcodes unique.             |
| Nothing happens with Enter  | Scanner suffix may be Tab instead of Enter; configure a CR suffix. |
