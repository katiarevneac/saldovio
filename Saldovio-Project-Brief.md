# FinPilot — context complet pentru continuarea proiectului în Codex

Data consolidării: 8 septembrie 2026.

> **Notă (2026-09-08):** produsul a fost redenumit din **FinPilot** în **Saldovio**. Restul acestui document păstrează numele original „FinPilot" din motive de context istoric al discuției care l-a generat — nu a fost rescris retroactiv. Numele curent de referință, folosit în cod, repository, Jira și documentația nouă, este **Saldovio**. Vezi `CLAUDE.md` pentru starea actuală.

Acest document reunește discuția de definire a proiectului, obiectivele de învățare, deciziile acceptate și propunerile încă deschise. Este un document de transfer de context, nu o afirmație că aplicația sau infrastructura există deja. Nu este o transcriere literală; păstrează informațiile importante și rezolvă contradicțiile prin prioritatea celor mai recente decizii.

## 1. Instrucțiunea principală pentru Codex

Construiește împreună cu mine FinPilot: un SaaS de gestionare financiară personală, utilizabil în realitate și prezentabil într-un portofoliu GitHub. Proiectul este în egală măsură un parcurs de învățare în dezvoltare software, arhitectură, baze de date, Git, Engineering Management, Product Ownership și Agile/Scrum, cu Jira și Confluence.

Sunt începătoare în dezvoltarea web. Nu genera toată aplicația dintr-o dată și nu transforma colaborarea într-un exercițiu în care doar copiez comenzi. Explică termenii, comenzile, traseul datelor, alternativele și compromisurile. Construim incremental, cu exerciții practice, verificări și feedback.

Direcția finală acceptată este o arhitectură cu frontend, Finance API și Analytics Service separate. Nu reveni implicit la monolitul modular propus inițial și nu muta backendul financiar în Next.js pentru comoditate. Dacă propui schimbarea unei decizii acceptate, explică de ce și discut-o cu mine.

## 2. Contextul utilizatoarei și obiectivul profesional

- Am experiență de management în inginerie software automotive, dar sunt începătoare în dezvoltarea web și construirea unui SaaS de la zero.
- Vreau să învăț să judec și să conduc un astfel de proiect ca Engineering Manager, nu doar să obțin un demo funcțional.
- Vreau să exersez și perspectiva Product Owner: problema utilizatorului, valoare, prioritizare, backlog, criterii de acceptare și feedback.
- Vreau să pot explica la interviu problema, alternativele, arhitectura, riscurile, testele și rezultatele.
- Explicațiile și lecțiile sunt în română. Codul, documentația de portofoliu, commit-urile și ticket-ele pot fi redactate în engleză, conform direcției propuse în conversație.
- Timpul disponibil nu a fost confirmat. Estimarea anterioară de 16–24 de săptămâni la 6–8 ore/săptămână era orientativă și preceda extinderea la servicii separate; trebuie recalibrată.
- Un proiect individual dezvoltă judecată tehnică și competențe de livrare, dar nu înlocuiește experiența conducerii unei echipe. Nu prezentăm simulările ca experiență reală de people management.

## 3. Ce am decis și ce s-a schimbat

| Subiect | Propunerea inițială | Direcția finală |
| --- | --- | --- |
| Produs | Proiect de portofoliu financiar | SaaS pentru portofoliu, învățare și utilizare reală |
| Module | Dashboard + simulator + forecast | Aceeași combinație, dezvoltată incremental |
| Arhitectură | Monolit modular Next.js | Frontend Next.js, Finance API NestJS, Analytics Service Python/FastAPI |
| Backend | În aceeași aplicație Next.js | Backend financiar separat în NestJS |
| Calcule | Logică TypeScript separată intern | Serviciu Python separat, introdus când construim forecast-ul |
| Stocarea banilor | Propunere inițială: bani întregi pentru RON | Direcție finală: zecimale precise și rotunjire explicită; reprezentarea completă se documentează |
| Proces | Git/GitHub și învățare tehnică | În plus Jira, Confluence, PO, EM și Agile/Scrum |
| Monetizare | Nu era stabilită | Posibilă etapă comercială ulterioară; nu blocăm MVP-ul cu plăți |

Nu există un unic stack „big tech”. Tehnologiile moderne nu garantează fiabilitatea. Utilizatoarea a cerut explicit servicii separate și a acceptat direcția NestJS + Python. Separarea este o alegere de produs și învățare, cu costuri reale de complexitate.

## 4. Viziunea produsului

**FinPilot — Personal Finance Decision Assistant / Personal Finance SaaS.**

Formulare de pornire:

> FinPilot ajută o persoană cu venit lunar și cheltuieli recurente să înțeleagă soldul estimat pentru următoarele 30 de zile și impactul unei achiziții, folosind ipoteze vizibile și calcule verificabile.

Cele trei întrebări principale:

1. Dashboard: „Unde se duc banii mei?”
2. Forecast: „Cu câți bani rămân?”
3. Simulator: „Ce se schimbă dacă fac această achiziție?”

Nu dorim doar un formular de cheltuieli cu grafice. Produsul trebuie să conecteze datele cu decizii explicabile și să arate ipotezele și limitele rezultatelor.

SaaS înseamnă aplicație oferită online ca serviciu, cu utilizatori și date private. Nu impune microservicii și nici abonamente plătite în prima versiune.

## 5. Funcționalitățile MVP-ului

- Autentificare cu o soluție matură; nu implementăm de la zero stocarea parolelor.
- Conturi financiare introduse manual, deținute de utilizator.
- Adăugare și gestionare de tranzacții și categorii.
- Dashboard lunar: venituri, cheltuieli, totaluri pe categorii și evoluții.
- Venituri și cheltuieli recurente.
- Forecast al soldului pe 30 de zile.
- Simulator pentru o achiziție plătită integral, comparată cu scenariul de bază.
- Import CSV într-un format documentat, cu previzualizare și erori clare.
- Demo cu date fictive, ușor de testat de un recrutor.
- Inițial numai RON.
- Arhitectură multiutilizator și autorizare pe server, chiar dacă primele exerciții sunt cu date fictive.

Pentru forecast vrem să evidențiem soldul minim și momentele în care soldul proiectat poate deveni negativ. Rezultatul este o proiecție bazată pe ipoteze, nu o certitudine.

Pentru simulator vrem comparație înainte/după: sold minim, rezerve rămase și eventual impact asupra economisirii. Costurile recurente asociate achiziției pot fi adăugate după fluxul simplu inițial.

### În afara MVP-ului inițial

- Conectare directă la bănci și sincronizare automată.
- Conversii valutare și contabilizare RON/EUR.
- Modele complexe de credit și rambursare anticipată.
- AI/chatbot și recomandări generate de un model.
- Aplicație mobilă nativă.
- Organizații, echipe și bugete comune.
- Monetizare și facturare.
- Scor financiar 0–100.

Scorul a fost amânat deoarece poate sugera autoritate fără o metodologie solidă. Preferăm indicatori explicabili și calcule transparente.

## 6. Ideile discutate și direcțiile ulterioare

În explorarea inițială au fost discutate opt idei. Combinația aleasă este dashboard + „Îmi permit?” + forecast; celelalte rămân inspirație, nu scope obligatoriu.

| Idee | Funcționalități discutate |
| --- | --- |
| Financial Health Dashboard | Bugete, rată de economisire, fond de urgență, îndatorare, import CSV, alerte și comparații lunare |
| „Îmi permit?” | Mașină/vacanță/telefon; cost inițial, rate, asigurare, întreținere, depreciere și scenarii |
| Debt Freedom Planner | Amortizare, snowball/avalanche, rambursare anticipată, reducerea perioadei vs ratei |
| Subscription Manager | Plăți recurente, scumpiri, cost anual, detectarea recurenței și remindere |
| Personal Finance Forecast | Sold zilnic pe 30–90 de zile, facturi, salarii și cheltuieli neașteptate |
| Shared Household Budget | Contribuții proporționale, 50/50, obiective comune și confidențialitate |
| Goal-Based Savings Planner | Obiective, economisire lunară necesară, termene, priorități și inflație |
| Romanian Finance Manager | RON/EUR, bonuri de masă, depozite, Pilonul III, titluri de stat și extrase locale |

Extinderile nu trebuie implementate automat doar pentru că apar în acest document.

## 7. Evoluția SaaS-ului

### Etapa A — MVP demonstrabil

Flux complet pentru utilizator autentificat, izolare a datelor și demo cu date fictive. Verificăm logica înainte de utilizarea datelor personale reale.

### Etapa B — beta cu utilizatori invitați

- Onboarding: primul cont și primele date.
- Feedback: utilizatorii înțeleg forecast-ul și revin să-l folosească?
- Export de date și ștergerea contului.
- Monitorizare, backup și restaurare verificată.
- Urmărirea costurilor de hosting, bază de date și servicii externe.

### Etapa C — versiune comercială, numai dacă alegem această direcție

Planuri gratuite/plătite, limite, checkout, anulări și plăți eșuate. Verificăm la momentul respectiv obligațiile legale și comerciale aplicabile. Nu presupunem că acestea sunt deja analizate sau că lansarea comercială este autorizată.

## 8. Arhitectura finală acceptată

Trei componente cu deployment independent:

| Componentă | Responsabilitate | Tehnologie |
| --- | --- | --- |
| Web | Pagini, formulare, dashboard, grafice și interacțiune | React + Next.js + TypeScript |
| Finance API | Conturi, tranzacții, autorizare, validare și operațiuni persistente | NestJS + TypeScript |
| Analytics Service | Forecast, scenarii și motor de calcul | Python + FastAPI |
| Date | Persistență, constrângeri și integritate | PostgreSQL |

Relațiile inițiale:

- Web comunică cu Finance API printr-un contract HTTP documentat.
- Finance API este responsabil de autorizare; browserul nu accesează direct PostgreSQL.
- Finance API accesează PostgreSQL și furnizează serviciului Analytics datele necesare calculului.
- Analytics întoarce rezultate și nu modifică tranzacțiile.
- Inițial Analytics nu accesează baza de date și nu depinde de tabelele interne ale API-ului.
- Dacă Analytics este indisponibil, utilizatorul trebuie să poată continua gestionarea tranzacțiilor. Un rezultat indisponibil nu se afișează ca zero.

Separarea nu presupune un microserviciu pentru fiecare entitate. Frontierele se bazează pe responsabilități și se documentează prin ADR-uri.

Putem păstra componentele într-un monorepo GitHub. Un repository comun nu înseamnă monolit; codul și deployment-ul sunt concepte diferite.

### Motive și compromisuri

- NestJS oferă structură pentru module, validare, autorizare și testare; OpenAPI documentează contractul HTTP.
- Python nu este necesar matematic pentru formulele propuse. A fost ales pentru separarea motorului și obiectivul de învățare/analiză viitoare.
- Două limbaje implică două ecosisteme de dependențe și teste, plus erori de rețea, compatibilitatea contractelor și cost de operare.
- Construim primul flux web + API + bază de date înainte să introducem serviciul Analytics la forecast.
- Nu introducem Redis, cozi, Kubernetes sau alte componente doar pentru imagine. Le evaluăm când există o nevoie, de exemplu importuri mari în fundal.

## 9. Stack: nivelul de certitudine al alegerilor

### Direcție acceptată

- TypeScript pentru Web și Finance API.
- React/Next.js pentru frontend; backendul financiar rămâne în NestJS.
- NestJS pentru Finance API.
- Python/FastAPI pentru Analytics.
- PostgreSQL.
- Git și GitHub.
- Docker și GitHub Actions pentru reproducibilitate și verificări/livrare, introduse gradual.

### Propuneri anterioare încă de validat în arhitectura actuală

- Prisma pentru accesul la date în NestJS, după exerciții de SQL.
- CSS de bază înainte de Tailwind; shadcn/ui ulterior dacă ajută.
- Recharts pentru grafice.
- Vitest pentru logica TypeScript și Playwright pentru fluxuri în browser. Alegerea runnerului pentru NestJS și a testelor Python se validează; nu sunt fixate toate instrumentele.
- Furnizor de autentificare matur; anterior au fost menționate Auth.js/Clerk ca exemple, nu alegeri finale.
- Hostingul nu este ales. Vercel a fost menționat în planul inițial; nu presupunem că găzduiește automat toate componentele noii arhitecturi.

### Alternative discutate

- JavaScript simplu vs TypeScript: tipurile ajută, dar trebuie înțelese și nu înlocuiesc validarea runtime.
- React + Vite vs Next.js: Vite simplifică frontendul; Next.js rămâne direcția aleasă, cu explicații despre server/client.
- SQLite vs PostgreSQL: SQLite simplifică pornirea, PostgreSQL oferă experiența relațională client–server dorită.
- SQL direct vs ORM: SQL oferă înțelegere explicită; ORM poate reduce codul repetitiv.
- Un singur limbaj vs Python separat: actuala alegere acceptă complexitate suplimentară pentru obiectivul educațional și frontiera analitică.

Verifică documentația oficială și versiunile compatibile când implementăm. Nu copia automat comenzi sau versiuni vechi din conversație.

## 10. Modelul de date și lecțiile despre baze de date

Entitățile de pornire: utilizator, cont financiar, tranzacție, categorie. Ulterior: reguli recurente, scenarii și eventual obiective/credite. Schema exactă încă trebuie proiectată, nu este stabilită doar prin această listă.

Subiecte de învățat prin implementare:

- Chei primare și străine, relații și ownership.
- Constrângeri și validarea integrității.
- SQL, JOIN, filtrare și agregări pentru dashboard.
- Migrații și evoluția schemei fără pierdere de date.
- Tranzacții de bază de date și operațiuni atomice.
- Indecși și investigarea interogărilor lente.
- Izolarea datelor între utilizatori.
- Backup și restaurare efectivă.

Reguli importante:

1. Transferul între conturi nu este venit sau cheltuială la nivel consolidat.
2. O plată planificată și tranzacția care o confirmă nu trebuie scăzute de două ori.
3. Importul repetat al aceluiași fișier trebuie tratat explicit; nu inventăm identificatori bancari care nu există în CSV.
4. Soldul inițial și data sa de referință trebuie definite astfel încât istoricul să nu fie numărat dublu.
5. Calendarul recurențelor, limitele perioadelor și zilele inexistente într-o lună necesită reguli și teste.

## 11. Motor financiar și surse de calcul

Avem acces la formule și documentație publică. Nu există acces implicit la scoringul intern al unei bănci, la date bancare personale sau la un motor bancar certificat. Conectarea bancară este o integrare separată, cu furnizor și autorizare.

### Indicatori și simulatoare discutate

| Calcul | Utilitate | Cerințe de precizie |
| --- | --- | --- |
| Cash-flow / sold proiectat | Identifică perioade cu disponibil redus | Sold de referință, recurențe, scadențe, fără dublare |
| Rezerve în luni | Acoperirea cheltuielilor esențiale | Active lichide disponibile și definiția cheltuielilor esențiale |
| Ponderea ratelor în venitul net | Presiunea obligațiilor asupra bugetului | Obligații și venituri incluse explicit |
| Rata de economisire | Evoluția surplusului | Definiție documentată și tratamentul transferurilor |
| Amortizare | Principal și dobândă în fiecare rată | Dobândă, date, convenții și rotunjire |
| Rambursare anticipată | Dobândă economisită și termen | Comisioane și reducerea ratei/perioadei |
| Scenarii de stres | Venit mai mic / cheltuieli mai mari | Ipoteze transparente, fără probabilități inventate |
| Impactul achiziției | Sold minim și rezerve rămase | Cost inițial și, ulterior, costuri recurente |

Modelele de credit sunt extinderi după MVP, nu condiție pentru prima lansare demonstrativă.

### Formula de amortizare discutată

Pentru principal P, rată lunară i și n plăți lunare egale:

```text
R = P * i / (1 - (1 + i)^(-n))

Dacă i = 0: R = P / n
```

Ipoteze: credit simplificat, dobândă fixă, plăți la intervale lunare egale, fără comisioane/asigurări. Împărțirea dobânzii nominale anuale la 12 este valabilă numai când aceasta corespunde convenției modelului. Nu introducem DAE ca și cum ar fi dobânda nominală.

Reproducerea unui scadențar real cere condițiile contractului, calendar, convenții de dobândă și rotunjire. Nu promitem echivalență cu banca doar pe baza formulei.

### Definiții și precizie

- PostgreSQL numeric/decimal pentru valori exacte; precizia și scala se aleg și se documentează.
- În aplicații folosim aritmetică zecimală adecvată; evităm conversii accidentale în float/JavaScript Number pentru calculele monetare.
- Stabilim reprezentarea sumelor în contractele JSON, unitățile, rotunjirea și limitele; acestea nu sunt încă implementate.
- Indicatorii cu numitor zero sau date insuficiente au rezultat indisponibil/explicat, nu o valoare fabricată.
- DTI în definiția CFPB folosește venit brut. Indicatorul personal bazat pe venit net se etichetează distinct și nu este prezentat drept eligibilitate bancară românească.
- Pragurile și regulile locale trebuie cercetate separat când sunt necesare. Nu transferăm automat standarde americane în România.
- Fiecare simulare arată ipotezele, datele de intrare relevante, data calculului și versiunea formulei.
- Testăm cu exemple independente, cazuri-limită și verificări ale proprietăților financiare; testele nu trebuie doar să copieze implementarea.

## 12. Fiabilitate, securitate și utilizare reală

Utilizatoarea vrea un produs pe care să se poată baza. Stack-ul nu este o garanție; avem nevoie de dovezi:

- Autentificare și autorizare sunt concepte distincte și se învață explicit.
- Verificări server-side pentru fiecare acces la date; nu avem încredere în userId trimis de browser.
- Teste negative de acces între utilizatori.
- Idempotency sau mecanisme echivalente pentru cereri repetate; nu dublăm tranzacții.
- Atomicitate pentru modificări care trebuie să reușească împreună.
- Contracte API validate și tratarea erorilor de rețea.
- Timeout și retry numai acolo unde sunt sigure; fără repetarea necontrolată a operațiunilor financiare.
- Indisponibilitatea Analytics nu blochează inutil operațiunile de bază.
- Loguri fără secrete și fără expunere inutilă a datelor financiare, identificatori de cerere și monitorizare.
- Backupuri și restaurare testată.
- Separarea datelor demonstrative de date reale.
- Date reale numai după verificările relevante de securitate, corectitudine și recuperare.
- Export și ștergere pentru beta; politicile concrete se definesc înainte de utilizarea publică reală.
- Costuri urmărite; fără promisiuni neverificate despre gratuitate sau scalare.

Țintele numerice de disponibilitate, latență, recuperare și cost nu au fost stabilite. Codex trebuie să ajute la definirea lor proporțional cu etapa produsului.

## 13. Cum trebuie să predea Codex

Fiecare etapă urmează ciclul:

1. Problema utilizatorului și rezultatul urmărit.
2. Mini-lecția, cu termeni explicați de la zero.
3. Alternative și decizie: beneficii, costuri, riscuri, motiv.
4. Exercițiu sau contribuție concretă a utilizatoarei.
5. Implementare mică, urmărită și explicată.
6. Testare și demonstrație.
7. Reflecție din perspectiva PO/EM.

Reguli pedagogice:

- Nu considerăm învățată o funcționalitate doar fiindcă funcționează.
- Utilizatoarea trebuie să poată explica traseul datelor, erorile posibile și verificarea.
- Alternăm fundamentele cu livrări practice; nu cerem absolvirea unui curs complet înainte de proiect.
- Explicăm comenzile noi, directorul în care rulează, efectul și rezultatul așteptat.
- Nu introducem multe instrumente noi în aceeași lecție.
- Oferim feedback pe ticket-ele și argumentele formulate de utilizatoare.
- Deciziile pot fi contestate și revizuite pe bază de dovezi; nu prezentăm preferințe ca adevăr universal.
- Păstrăm un jurnal al progresului: ce știe deja, ce s-a construit și următorul exercițiu.

## 14. Roluri de exersat

| Perspectivă | Întrebarea | Exerciții |
| --- | --- | --- |
| Product Owner | Ce merită construit și de ce? | Viziune, prioritizare, criterii, feedback și scope |
| Engineering Manager | Cum creăm condiții pentru livrare bună? | Capacitate, riscuri, calitate, compromisuri și comunicare |
| Developer | Cum implementăm și verificăm? | Cod, teste, debugging și decizii tehnice |

Engineering Manager nu este o responsabilitate formală Scrum. Un proiect individual cu AI nu este o echipă Scrum completă. Simulăm situații de management fără a pretinde experiență de conducere a unor colegi inexistenți.

Situații de practică discutate:

- Deadline-ul se reduce: ce scoatem din scope și cum comunicăm?
- Forecast-ul dublează o plată: cum investigăm și prioritizăm?
- Un coleg propune rescrierea backendului: cum evaluăm dovezile și costul?
- Feedback, delegare, conflicte și performanță: exerciții de argumentare și comunicare, cu limitele simulării explicite.

## 15. Jira — muncă reală, nu doar un board decorativ

Vrem să învățăm configurarea și utilizarea Jira în proiect. Nu există încă un proiect Jira creat sau o conexiune confirmată.

Descompunerea conceptuală: obiectiv de produs → epic → user stories → taskuri/subtaskuri, plus buguri și investigații. Configurația exactă a ierarhiei se adaptează tipului de proiect Jira; obiectivul de produs nu este presupus automat un tip de issue.

Exemplul discutat:

| Element | Exemplu |
| --- | --- |
| Epic | Gestionarea tranzacțiilor |
| User story | Ca utilizator, vreau să înregistrez o cheltuială pentru a-mi urmări banii cheltuiți |
| Criteriu | Cheltuiala validă apare în listă și în totalul perioadei corecte |
| Task | Formular și validare pe server |
| Bug | Dublarea tranzacției la apăsarea repetată a butonului |

Vom exersa:

- User stories și criterii de acceptare observabile.
- Împărțirea cerințelor mari în livrări mici.
- Prioritizarea și ordonarea backlogului.
- Statusuri, dependențe, blocaje și investigații cu rezultat clar.
- Planificare în funcție de capacitate.
- Legătura issue → branch → pull request.
- Rapoarte interpretate fără confundarea numărului de ticket-e cu valoarea.

Nu orice activitate este user story. O migrare sau o investigație poate fi un task direct. Nu generăm un backlog uriaș înainte de validarea produsului.

## 16. Confluence — context și decizii

Nu există încă un spațiu Confluence creat sau acces confirmat. Dorim să învățăm instrumentul efectiv, nu numai să îl imităm prin Markdown.

Pagini planificate:

- Product vision & scope / Product Brief.
- Roadmap pe rezultate.
- Cerințe pe funcționalitate: reguli, exemple și situații-limită.
- Arhitectură și ADR-uri: context, opțiuni, decizie și consecințe.
- Contracte între servicii și referințe la documentația API.
- Registru de riscuri.
- Sprint review și retrospective.
- Update-uri de progres pentru stakeholderi.
- Ghid de operare, lansare, incidente și recuperare.

Jira urmărește munca; Confluence explică contextul; GitHub păstrează codul și istoricul. Legăm sursele și stabilim unde este informația autoritativă, fără a copia manual aceeași cerință în trei locuri.

## 17. Agile/Scrum aplicat educațional

Agile reprezintă valori și principii; Scrum este un cadru de lucru. Un board Jira nu face automat proiectul Agile.

Propunerea inițială: sprinturi de două săptămâni, ajustabile după timpul disponibil.

| Activitate | Aplicare |
| --- | --- |
| Sprint Planning | Un obiectiv clar și muncă realistă pentru capacitatea disponibilă |
| Verificarea progresului | Ce s-a schimbat, blocaje și adaptarea planului |
| Backlog refinement | Clarificare și împărțire continuă a muncii viitoare |
| Sprint Review | Demo, feedback și adaptarea produsului |
| Retrospectivă | O îmbunătățire concretă a modului de lucru |

Nota individuală de progres nu este echivalentă cu un Daily Scrum într-o echipă. Refinement-ul este activitate continuă, nu un eveniment formal obligatoriu al Scrum.

Învățăm Product Goal, Sprint Goal, backlog, increment, criterii de acceptare și Definition of Done. Estimarea, story points și velocity se discută, dar nu devin metrici de performanță personală. La început contează dimensiunea taskurilor și înțelegerea diferențelor dintre estimări și realitate.

## 18. Git/GitHub și verificare

Fluxul de învățare:

1. Issue cu problemă și criterii.
2. Branch pentru schimbare.
3. Commit-uri mici, cu sens.
4. Pull request: de ce, ce, cum am verificat.
5. Review și verificări automate.
6. Integrare în main.

Exersăm și conflict de merge, anulare sigură și investigarea unui bug din istoric. Configurăm protecții și verificări obligatorii unde planul GitHub permite, fără a cere aprobarea propriei schimbări într-un mod care blochează un proiect individual.

Testele încep cu primele funcționalități, nu la final:

- Unitare pentru calcule și reguli.
- Integrare pentru API și baza de date.
- Contracte între servicii, pe măsură ce apar.
- End-to-end pentru fluxurile importante în browser.
- Izolarea utilizatorilor, duplicate, date-limită și indisponibilitatea analizei.

Definition of Done: criterii îndeplinite, verificări relevante, tratarea erorilor, documentație actualizată și demo posibil. „Merge pe calculatorul meu” nu este suficient.

## 19. Roadmap de învățare și livrare

Acest roadmap adaptează planul anterior la arhitectura finală. Nu este un angajament calendaristic.

| Etapă | Livrabil | Învățare tehnică | Practică PO/EM |
| --- | --- | --- | --- |
| 0 | Product Brief, scope și backlog inițial | Cerințe funcționale/nefuncționale | Obiective și prioritizare |
| 1 | Pagină cu date fictive și repository | Terminal, HTML/CSS, JavaScript, Git | Taskuri mici |
| 2 | Prima tranzacție salvată prin Web + API + DB | TypeScript, React, NestJS, HTTP, SQL | Criterii și demo |
| 3 | Date private pe utilizator | Autentificare, autorizare, validare | Riscuri de securitate |
| 4 | Dashboard corect | Agregări SQL și grafice | Definirea metricilor |
| 5 | Analytics separat și forecast pe 30 zile | Python/FastAPI, contracte, recurențe și teste | Ipoteze și complexitate |
| 6 | Simulator bază vs achiziție | Reutilizarea motorului de calcul | Scope și valoare |
| 7 | CSV cu preview și erori | Parsare, duplicate și robustețe | Prioritizarea defectelor |
| 8 | Demo, CI/CD și documentație | Docker, deployment, monitorizare și recuperare | Decizie de lansare |
| 9 | Beta invitată | Onboarding, export/ștergere și operare | Feedback și costuri |
| Ulterior | Credite, alte module sau monetizare | După validarea nevoii | Roadmap și trade-off-uri |

Jira/Confluence, documentația, testarea și reflecția se practică transversal, nu doar la ultima etapă.

## 20. Portofoliul final

- Repository clar și instrucțiuni reproductibile.
- Demo cu date fictive și capturi de ecran.
- README: problemă, public, funcționalități, pornire, arhitectură, teste, limitări și roadmap.
- Model de date și diagrame utile.
- ADR-uri care arată alternative și compromisuri.
- Istoric de issue-uri și pull request-uri semnificative.
- Dovezi de corectitudine a calculelor și contractelor.
- Exemple de prioritizare, sprint reviews, retrospective și analiză de incident.
- Documentație fără date personale sau secrete.
- Prezentare onestă: proiect individual cu asistență AI, nu echipă condusă în realitate.

Succesul înseamnă atât produs funcțional, cât și capacitatea de a explica de ce este construit astfel.

## 21. Starea actuală și întrebări deschise

La momentul acestui document s-a făcut planificare, nu implementare. Nu s-au confirmat repository, conturi de hosting, Jira/Confluence, servicii de autentificare, infrastructură, date reale, costuri sau versiuni de dependințe.

De clarificat la etapa relevantă:

- Mediul local și instrumentele deja instalate.
- Timpul săptămânal disponibil.
- Repository-ul, vizibilitatea și conturile necesare.
- Conexiunile Jira/Confluence și configurarea lor.
- Furnizorul de autentificare și hostingul pentru fiecare componentă.
- ORM, test runner Python/NestJS, structură monorepo și contracte monetare.
- Buget de operare și ținte de fiabilitate.
- Definiția exactă a soldului proiectat și a cheltuielilor incluse.

Nu cere toate aceste răspunsuri înainte de prima lecție. Clarifică progresiv ceea ce blochează următoarea livrare. Nu crea resurse externe, nu activa servicii plătite și nu publica date reale doar pe baza acestui document de context; urmează autorizarea efectivă din sesiunea de lucru.

## 22. Ce trebuie să facă Codex la început

1. Citește integral acest document și confirmă pe scurt obiectivul și arhitectura finală.
2. Nu reia brainstormingul celor opt aplicații și nu generează tot SaaS-ul.
3. Începe cu Lecția 1: problema, scope-ul și diferența dintre browser, API și bază de date.
4. Pregătește cu utilizatoarea Product Brief-ul și definește ce înseamnă sold estimat.
5. Dedu din regulile produsului datele necesare și prima livrare mică.
6. Construiește backlogul inițial și propune primul Sprint Goal.
7. Ghidează configurarea mediului, Git/GitHub și Jira/Confluence când este utilă.
8. La fiecare sesiune păstrează contextul progresului și explică următorul pas.

## 23. Surse oficiale consultate în discuție

Acestea sunt referințe pentru conceptele discutate, nu certificarea aplicației. Verifică documentația curentă la implementare.

- Next.js, server/client components: https://nextjs.org/docs/app/getting-started/server-and-client-components
- Next.js, getting started: https://nextjs.org/docs/app/getting-started
- NestJS, documentație: https://docs.nestjs.com/
- NestJS, OpenAPI: https://docs.nestjs.com/openapi/introduction
- NestJS, queues: https://docs.nestjs.com/techniques/queues
- PostgreSQL, numeric types: https://www.postgresql.org/docs/current/datatype-numeric.html
- GitHub, protected branches: https://docs.github.com/repositories/configuring-branches-and-merges-in-your-repository/defining-the-mergeability-of-pull-requests/about-protected-branches
- CFPB, DTI: https://www.consumerfinance.gov/ask-cfpb/what-is-a-debt-to-income-ratio-en-1791/
- CFPB, amortization: https://www.consumerfinance.gov/ask-cfpb/what-is-amortization-and-how-could-it-affect-my-auto-loan-en-771/
- CFPB, monthly mortgage payments: https://www.consumerfinance.gov/ask-cfpb/how-do-mortgage-lenders-calculate-monthly-payments-en-1965/

Sursele CFPB sunt americane și explică modele/concepte. Nu stabilesc regulile de creditare aplicabile în România.
