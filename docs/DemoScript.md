# Demo script — WBS-32.1

Draft, 17.11.2026. It follows the scenarios of the Requirements Specification
(SC-01 – SC-09) and is run on the live site with the demo test data
(WBS-32.2). Steps for features that are not built yet are marked *(not built
yet)*; they are rehearsed once the feature is merged (WBS-32.3).

Time limit: about 15 minutes. Each block names who presents it.

## Before the demo

- Open the live site 5 minutes early: the free API sleeps after 15 minutes
  without requests and needs about a minute to wake up.
- Log in to these demo accounts in separate browser windows (data from
  WBS-32.2): Elif (passenger), Mert (driver), Zeynep (askıda bilet
  requester), Can (donor), Deniz (student), Ayşe (moderator), Burak (admin).
- Prepared data: a trip İstanbul → Ankara with free seats, a full trip
  İstanbul → Ankara for the waitlist, a trip İstanbul → İzmir by Mert that
  already took place, a few room listings in Sarıyer, and forum questions.

## 1. Sign-up and booking — SC-01 (Egemen, Bünyamin) · 3 min

1. Sign up with a new @itu.edu.tr address; show that a non-İTÜ address is
   refused. *(sign-up page not built yet, WBS-1.3)*
2. Enter the code from the e-mail; log in. *(login page not built yet, WBS-2.3)*
3. As Elif, search İstanbul → Ankara. Trips with free seats come first; full
   trips are marked "Dolu".
4. Open a trip, show the driver's ratings and book a seat. The booking appears
   in "Rezervasyonlarım".
5. Pay with an iyzico test card; the money is held and a notification arrives.
   *(not built yet, WBS-10.1, WBS-10.3, WBS-22.2)*

## 2. Waitlist — SC-09, optional (Bünyamin) · 1 min

1. As Elif, open the full trip and click `Bekleme listesine katıl`; the place
   in line is shown.
2. As the passenger of that trip, cancel the booking.
3. As Elif, open "Rezervasyonlarım": a seat is held for her until a given
   time. Book it.

## 3. Posting and cancelling a trip — SC-02, SC-03 (Ege, Alperen) · 3 min

1. As Mert, post a trip İstanbul → İzmir: show that a trip where neither city
   is İstanbul is refused.
2. Cancel a trip with a booking; the passenger's booking is cancelled and the
   refund is in the ledger. *(refund and notification not built yet, WBS-11.1,
   WBS-22.2)*
3. On the trip that already took place, Mert and the passenger mark the ride
   as ended; the payment is released and both rate each other. *(not built
   yet, WBS-9.x, WBS-10.2, WBS-16.x)*

## 4. Askıda bilet — SC-04 (Alperen) · 2 min

*(not built yet, WBS-12.x, WBS-13.x)*

1. As Zeynep, create a request for a trip to Bursa.
2. As Can, open the pool: only the amount and the date are shown. Pay the
   request; the thank-you screen shows no name and no route.
3. As Zeynep, show the notification and the booking. As the driver, show that
   the passenger list does not name the donor.

## 5. Housing and forum — SC-05, SC-06 (Fuat) · 3 min

1. As Deniz, filter room listings by Sarıyer and "Odam var". Post an "Oda
   arıyorum" listing with an e-mail address.
2. In the forum, search "cumartesi" (keyword search) and show the AI search box
   with "Yemekhane hafta sonu açık mı?" (optional, WBS-23.3).
3. Post a question in the yemekhane category; as another student, answer it.
   Deniz sees the notification on the bell. *(bell not built yet, WBS-22.3)*

## 6. Moderation and admin — SC-07, SC-08 (Egemen, Bünyamin) · 3 min

1. Post a room listing with insulting words; it stays published and the AI
   adds it to the moderation queue (WBS-24.1).
2. As Ayşe, open the queue: hide the listing and warn its owner; dismiss the
   report about another post. *(queue pages not built yet, WBS-25.x)*
3. As Burak, give a student the moderator role, then open the askıda bilet
   overview and the usage statistics. *(not built yet, WBS-26.x)*

## If something goes wrong

- The API does not answer: wait one minute (it is waking up) and reload.
- The AI provider does not answer: the content is still published and the
  queue shows it as "AI unavailable"; say so and continue.
- A step fails: say what should happen, move to the next block, and come back
  at the end if time allows.
