# SalesBoard

Interna prodajna analitika, jamstva i zahtjevi za smjene za deset Big Bang maloprodajnih jedinica.

## Korisničke uloge

- **Zaposlenik** vidi svoje rezultate, mjesečni target poslovnice, kalkulator i evidenciju jamstava te vlastite zahtjeve za smjene.
- **Voditelj** uz puni pregled svoje poslovnice postavlja broj radnih dana, target jamstava u eurima i razinu vidljivosti poretka, uvozi prodajne podatke za svoju poslovnicu te odobrava ili odbija zahtjeve za smjene.
- **Superadmin** odobrava registracije i upravlja postavkama svih poslovnica.

Registracija koristi korisničko ime u obliku `ime.prezime`, lozinku i odabranu poslovnicu. Novi račun ostaje na čekanju dok ga superadmin ne odobri. Lozinke su spremljene kao PBKDF2 hash, a sesijski tokeni samo kao SHA-256 sažeci.

Kalkulator jamstva koristi katalog tipova i postotaka iz projekta `project-bj`, ali ne uvozi njegove korisnike, zahtjeve ni prodaje. Jamstvo se računa na originalnu cijenu proizvoda prije popusta, a svi novčani iznosi u bazi čuvaju se u centima.

## Lokalno pokretanje

Koristite Node.js 24. Za lokalni pregled sučelja s izmišljenim podacima pokrenite:

```bash
npm ci
VITE_DEMO_MODE=true npm run dev
```

Istu postavku možete spremiti u `.env.local`. U demo načinu kliknite **Prijava** bez lozinke. Demo je dostupan u razvojnom poslužitelju, a produkcijski build izostavlja demo podatke.

## Provjera i build

```bash
npm test
npm run typecheck
npm run build
```

Build izrađuje React klijent u `dist/client`, Worker u `dist/server/index.js` i kopira migracije u `dist/drizzle`. Za ove provjere dovoljna je svježa kopija repozitorija s instaliranim ovisnostima.

## Sigurna konfiguracija lozinki

Generirajte hash lokalno, bez slanja lozinki u chat ili repozitorij:

```bash
npm run hash-password -- "DUGA_DASHBOARD_LOZINKA"
npm run hash-password -- "DUGA_ADMIN_LOZINKA"
```

Dobivene hashove postavite kao Cloudflare/Sites runtime secrets `DASHBOARD_PASSWORD_HASH` i `ADMIN_PASSWORD_HASH`. Lozinke, hashove i izvještaje držite izvan repozitorija.

## Dnevni uvoz

Administrator se prijavi u `Administracija`, odabere `.xlsx` izvještaj i pokrene središnji uvoz za svih deset podržanih poslovnica. Voditelj isti izvještaj može učitati iz postavki poslovnice, ali server iz njega prihvaća samo retke njegove poslovnice. Parser zahtijeva `Datum`, `POSLOVNICA`, `KOMERCIJALIST`, `KOLIČINA` i `VREDNOST`, mapira potvrđene nazive poslovnica, normalizira hrvatske datume/decimale i sprema novčane vrijednosti u cijelim centima. Retci za Webshop, B2B, Veleprodaju i retci bez poslovnice preskaču se uz upozorenje.

Uvoz je idempotentan po `(poslovnica, datum, djelatnik)`: preklapajući kumulativni izvještaj ažurira postojeći dnevni zapis, ali ga ne zbraja drugi put. Izvorni redovi se ne tretiraju kao računi. Za svaki uvoz sprema se fingerprint, upozorenja i prije/poslije vrijednost, čime je moguć rollback.

## Cloudflare / Sites

Za objavu na Sites pripremite `.openai/hosting.json` za odgovarajući projekt. Build ga kopira u `dist/.openai/hosting.json` kad je prisutan. Manifest je lokalna konfiguracija i izostavljen je iz Gita.

Prije produkcijskog pokretanja povežite D1 bazu s Workerom pod bindingom `DB`, redom primijenite migracije iz mape `migrations` i konfigurirajte runtime secrets za postojeći interni i administratorski pristup.
