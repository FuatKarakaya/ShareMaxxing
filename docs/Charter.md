# Project Charter: İTÜ ShareMaxxing

## 1\. Project Purpose and Objectives

İTÜ ShareMaxxing is a web and mobile platform where İTÜ students help each other, open only to verified @itu.edu.tr accounts. Its core is intercity ride sharing to and from İstanbul: drivers post the cities they will pass through and their free seats, passengers search by start and end city, and drivers share their travel costs with passengers through in-app payment. An anonymous "askıda bilet" pool lets the community fund seats for students in financial need. The same accounts and reputation also serve a roommate and housing finder and a student forum.

### Objectives
* Provide a trusted ride-sharing platform limited to verified İTÜ students  
* Help students share travel costs fairly, keeping rides as cost sharing rather than a commercial service
* Let the community anonymously fund seats for students in financial need  
* Bring housing search and student questions into the same trusted platform  
* Deliver working web and mobile applications on one cloud-hosted backend


## 2. Stakeholders & Roles
* **Product Owner:** Mehmet Fuat Karakaya
* **Software Engineering Team:**
    * Mehmet Fuat Karakaya : Product Owner & Backend Developer (Rides, Search, booking)
    * Ege Demir : Configuration Manager & DevOps, Authentication, Forum/Housing and AI Integration
    * Alperen Akbaş : Quality Assurance (QA) Manager & Backend Developer (Payments, Askıda Bilet)
    * Bünyamin Kalaycı : Project Manager (GitHub Projects) & Web Frontend Developer
    * Egemen Çevik : UI/UX Coordinator & Mobile App Developer

* **GH Repo/Project URL:** 
## 3\. Project Scope

### Project domain

Education, in the area of student community services. The hypothetical customer is a university student affairs office or student union that wants a trusted alternative to unmoderated WhatsApp groups. Key users are İTÜ students acting as drivers, passengers, donors, funded-seat recipients, room seekers, room owners and forum members, together with moderators and administrators.

### In-Scope

* Accounts and access: sign-up restricted to @itu.edu.tr addresses with email code verification, user profiles, and student, moderator and admin roles  
* Ride posting: a driver publishes a trip that starts or ends in İstanbul as an ordered list of cities with date, time and number of free seats, plus optional contact details shown to verified students so that questions can be asked before booking  
* Ride search and booking: a passenger enters a start and an end city; the engine returns trips that visit both in the right order and still have a free seat; each trip has one seat count, with booking, cancellation and a waitlist  
* Cost sharing: drivers set a price per seat to share their travel costs; pricing guidelines (such as distance travelled or extra luggage) will be defined during requirements
* In-app payment: passengers pay in the app; the amount is held until the ride is completed and then released to the driver, with refunds on cancellation (payment provider in test mode; note: the full payment flow described here would require legal and regulatory review)  
* Askıda bilet: donors pay into a shared pool; eligible students book a seat funded by the pool; recipients are anonymous to donors and drivers, and donors are anonymous to recipients; every movement is recorded in a ledger  
* Trust and safety: ride history, two-way ratings revealed only after both sides submit, no-show records, user reports and a moderation queue  
* Housing and roommates: "I have a room" and "I need a room" listings, contact details revealed only on mutual acceptance, listings are tagged with an İstanbul district
* Forum: questions and answers with category filters (course-related, general, yemekhane, housing, transport, campus life), course code tags, votes, search  
* Notifications: email and mobile push for bookings, payments, and replies  
* AI assistance: AI-supported search in the forum and AI-supported flagging of unsuitable content for moderator review  
* Admin panel: moderation queue and report handling (moderators and admins), plus user management, donation pool overview and usage statistics (admins only). 
* Web application and mobile application on one backend API, deployed to the cloud with an automated build and test pipeline

### Out-of-Scope

* Live transactions with real money (the payment provider is used in test mode only)  
* Automatic route planning, map navigation and live GPS tracking of rides  
* Trips that neither start nor end in İstanbul  
* Rides within a city and daily campus commuting  
* Verification of driving licences, vehicle documents or insurance  
* Real-time chat between users  
* Integration with İTÜ's own login and student information systems  
* Rent payments, deposits and rental contracts  
* Verification of financial need through official documents  
* Support for other universities

## 4. Technology Stack

### Backend Stack

* Node.js with Express (TypeScript) offering REST APIs  
* PostgreSQL with Prisma ORM  
* JWT-based authentication with role-based authorization  
* iyzico payment API in sandbox mode  
* Jest and Supertest with GitHub Actions (test-first development and CI)  
* {*Cloud provider from the course link*}

### Frontend Stack

* React (TypeScript) with Vite and Tailwind CSS for the web app and admin panel  
* React Native with Expo for the mobile app, including push notifications

### AI Stack

* A hosted AI model API for the forum search and moderation features {*provider and models to be decided in the design phase*}
## 5\. Project Milestones

| Deliverable | Deadline |
| :---- | :---- |
| Project Charter | 05.10.2026 23:59 |
| Project Plan | 19.10.2026 23:59 |
| Requirement Specification Report | 02.11.2026 23:59 |
| Requirement Analysis Report | 23.11.2026 23:59 |
| Software Design Report | 07.12.2026 23:59 |
| Software Test Report | 21.12.2026 23:59 |
| Codebase | 25.12.2026 23:59 |
| Demo | 26.12.2026 23:59 |
| Presentation | 28.12.2026 23:59 |

