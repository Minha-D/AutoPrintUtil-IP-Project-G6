# AutoPrintUtil:PrintPoint — University/Business Print System

A course project for **IP-47**: Users/Students log in with their
student ID/Email, upload a PDF, preview it in the browser, and send it to a
connected printer — choosing the number of copies and color or
black-and-white — without emailing files back and forth or walking a flash
drive over to the print counter.
This is a system designed for automated printing for businesses / university's where used interaction
isn't requred for basic Printing Job.
## Features

- **Student login/User** — simple ID-based authentication against a roster
- **PDF upload** — drag-and-drop-friendly file input, PDF-only validation
- **In-browser preview** — view an uploaded document before printing it
- **Print options** — choose number of copies and color / black-and-white
- **Print log** — every job is recorded with student ID, copies, color mode, and timestamp
- **FIFO print queue** — jobs are processed one at a time; users see their queue position, active printing state, and completion status
- **Windows printing** — sends jobs through the Windows printer queue using the bundled SumatraPDF engine

## Tech stack (Proposed)

| Layer     | Choice                                  |
|-----------|------------------------------------------|
| Frontend  | HTML, CSS, Bootstrap 5, vanilla JS       |
| Backend   | Node.js, Express                         |
| Storage   | JSON file (`db.json`) — no DB server to install |
| Uploads   | Multer                                   |
| Printing  | [`pdf-to-printer`](https://www.npmjs.com/package/pdf-to-printer) |

A flat JSON file stands in for a real database so there's nothing to
compile or install beyond `npm install` — useful for a Windows demo machine
that doesn't have MySQL or native build tools set up. Swap in SQLite/MySQL
later if your rubric requires a real DB.

## Project structure(Proposed, matter to Change)

```
student-print-system/
├── server.js              # Express app entry point
├── db.js                  # JSON-file "database" helper
├── db.json                # created on first run, holds students/documents/log
├── middleware/
│   └── auth.js             # session guard for protected routes
├── routes/
│   ├── auth.js              # login / logout / session check
│   ├── upload.js            # PDF upload + document listing
│   └── print.js             # print job + printer list
├── public/
│   ├── login.html
│   ├── documents.html       # view / upload / print UI
│   └── js/
│       ├── login.js
│       └── documents.js
└── uploads/                 # uploaded PDFs land here
```

### Connecting a real printer

Printing uses the Windows default printer unless `PRINTER_NAME` is set to an exact installed printer name.

### Run on Windows

1. Install Node.js 18 or newer and add your printer in Windows Settings → Bluetooth & devices → Printers & scanners. Set it as the default printer if you want to use automatic selection.
2. Open PowerShell in the project folder and run:

```powershell
npm install
npm start
```

3. Open `http://localhost:3000` and log in with a student ID listed in `db.js`.

To choose a specific printer instead of the Windows default, get its exact name with `Get-Printer`, then set it before starting the server:

```powershell
$env:PRINTER_NAME = "Exact printer name"
npm start
```

The `PRINTER_NAME` setting only applies to that PowerShell session. `pdf-to-printer` is Windows-only; printing on Linux or macOS requires a different printer library.

### Admin dashboard

Set `ADMIN_IDS` to a comma-separated list of admin login IDs before starting the server. Admin IDs do not need to be in the student roster.

```powershell
$env:ADMIN_IDS = "admin-id-1,admin-id-2"
npm start
```

Admins sign in through the normal login page and are sent to `/admin.html`. The dashboard is refreshed every 15 seconds and shows machine resources, printer status, storage usage, accounts, queue totals, and recent print errors.

## Notes / limitations

- Sessions use `express-session`'s in-memory store — fine for a single-server
  class demo, but sessions reset if the server restarts.
- `pdf-to-printer`'s `sumatraPdfSettings` option syntax can shift between
  package versions — run `npm docs pdf-to-printer` after installing to
  confirm current option names before a demo.
- No HTTPS/production hardening is included; this is scoped for a course
  project demo, not real-world deployment.

## Course context

Built for the **Internet Programming** course. Not affiliated with or
endorsed by any actual printing vendor.
## Here Some Module Illustrations
![Landing Page](/pics/0.png)
![Login Page](/pics/1.png)
![Status Page](/pics/2.png)
![File Preview Page](/pics/3.png)
![Printing Status Page](/pics/4.png)
