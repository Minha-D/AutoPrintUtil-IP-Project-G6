# PrintPoint — Student Print System

A course project for **Internet Programming**: students log in with their
student ID, upload a PDF, preview it in the browser, and send it to a
connected printer — choosing the number of copies and color or
black-and-white — without emailing files back and forth or walking a flash
drive over to the print counter.

## Features

- **Student login** — simple ID-based authentication against a roster
- **PDF upload** — drag-and-drop-friendly file input, PDF-only validation
- **In-browser preview** — view an uploaded document before printing it
- **Print options** — choose number of copies and color / black-and-white
- **Print log** — every job is recorded with student ID, copies, color mode, and timestamp
- **Cross-platform printing** — works on Windows (bundled SumatraPDF) and Linux/Mac (`lp`/`lpr`), so the same code runs on a dev machine and a Windows demo PC

## Tech stack

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

## Project structure

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

## Getting started

```bash
git clone <this-repo-url>
cd student-print-system
npm install
npm start
```

Open `http://localhost:3000/login.html`.

On first run, `db.json` is created with two seeded test IDs: `2021001` and
`2021002`. Replace these with your real class roster in `db.js` (or edit
`db.json` directly after the first run).

### Connecting a real printer

`routes/print.js` needs the exact printer name as your OS sees it:

- **Windows:** Settings → Bluetooth & devices → Printers & scanners
- **Linux/Mac:** `lpstat -p`

Set that value in `PRINTER_NAME` inside `routes/print.js`. Once the server
is running, `GET /api/printers` (while logged in) also lists available
printers programmatically.

## Pricing / front page

A standalone marketing-style front page (`printpoint-landing.html`) is
included separately to explain the service to users — ৳3/page for
black-and-white, ৳5/page for color. It's a single self-contained HTML file
and isn't wired into the app; it's meant as a landing page you could point
a domain at, or show alongside the working app in a demo.

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
