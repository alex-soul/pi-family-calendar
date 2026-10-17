# Phone access and QR reminders

1. Open `/admin/access` and turn on **QR reminders → Manage reminders via QR codes**.
2. On the calendar, tap **+** in the reminder panel to add, or open a reminder and tap its pencil handle.
3. Scan with a phone on the same reachable home network, fill in the form and save.
4. After adding, **Add another reminder** opens a fresh form with the same starting date, if one was selected. **Done** ends access.

When event creation and reminder QR management are both enabled, the Add popup has **Event / Reminder** buttons. Calendar entry points start on Event and pass the selected date to Reminder. The reminder-panel Plus starts on Reminder without a date; switching to Event uses the day represented by that panel. Multi-day selections offer Event only. The phone can change or clear a reminder date.

QR management starts off. Enabling it lets anyone using a calendar display obtain a reminder-management link without the admin PIN. It does not identify family members or pair trusted screens. Keep it off if this is not appropriate for your installation. Admin remains independently PIN protected. No Google write permissions are involved.

Codes allow five minutes to scan and can be redeemed once. The resulting session lasts fifteen minutes, with an absolute deadline. Add sessions permit multiple additions; Edit sessions permit one successful update to the selected reminder, or confirmed deletion if it is a note. For recurring reminders this affects the whole series. To-dos cannot be deleted through QR access. Neither session permits browsing admin, changing settings or using an Edit grant to create. Turning the feature off revokes outstanding codes and sessions immediately. Expired saves retain the entered form on screen; scan again to start new access.

## Enable LAN access

The default Compose setup remains localhost only. To use a phone, add this machine's LAN IPv4 address to the ignored `.env` file:

```dotenv
LAN_ADDRESS=192.168.1.50
```

Replace the example with your actual address, preferably kept stable with a router DHCP reservation. Then run:

```sh
docker compose -f compose.yaml -f compose.lan.yaml up --build -d
```

Open `http://YOUR-LAN-IP:8775` on the phone. Enter `/admin` manually for administration. The override preserves `http://127.0.0.1:8775` for laptop Google consent and sets the phone-reachable QR destination automatically. Use the same two Compose files for subsequent updates. Existing data stays in the same volume.

The app accepts only explicitly allowed origins and requires same-origin mutations. Its direct Node server owns the protocol header; incoming proxy headers cannot change its origin. This setup is intended for a trusted home LAN over HTTP, with no router port forwarding. HTTPS/reverse-proxy deployment is not configured here. Google connection/reconnection still takes place on localhost; the Pi's planned SSH helper remains separate work.

If Windows Firewall blocks phone access, allow inbound TCP 8775 on the **Private** network profile, restricted to the machine's LAN address and your home subnet. This requires Windows administrator rights. The repository includes `scripts/allow-lan-windows.ps1` for this: run it in Administrator PowerShell with `-Address YOUR-LAN-IP -Subnet YOUR-HOME-CIDR`. It creates only the named Private-profile TCP rule, restricted to those addresses. Do not disable the firewall. VPN LAN isolation or guest Wi-Fi can also prevent access.

## Developer notes

The `/reminder` page reuses the admin editor form without the admin shell. Notes expose Delete reminder with a confirmation; to-dos do not. The QR contains a fragment token, removed from the address immediately after opening; requests exchange it for a per-tab session. Neither token is an admin credential. Only token hashes are stored. Tokens are not printed in logs or sent to third-party QR services; rendering is local.

Grant state and save receipts share the reminders SQLite connection. A reminder write, its retry receipt and consumption of an Edit grant commit atomically. A repeated save request returns its original result. Version conflicts leave the grant and draft intact. Add-another creates a fresh form/request identifier. Disabled or expired grants fail on the backend, even if an old page remains visible.

Run `node scripts/qr-smoke.mjs http://127.0.0.1:3000 --disposable` only against an empty test installation without Google configuration. It checks actual QR decoding, scoped permissions, PIN separation, repeated additions, duplicate-save protection, stale versions, revocation and Origin rejection. It leaves QR enabled for isolated UI testing. Never run it against household data.

Edit QR codes start collapsed and are generated only when the pencil dock is expanded. Deletion checks the current stored type and version on the server, consumes the Edit grant and has its own retry receipt. Stale edits, Add grants and to-do grants cannot delete a note through another identifier.

Add reminder grants store an optional validated date default in SQLite. Redemption and page reload preserve it; it is a form default, not a save restriction. Existing grants migrate with no date. Switching Add modes preserves each generated code until the popup closes.
