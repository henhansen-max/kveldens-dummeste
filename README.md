# Hvem er kveldens dummeste? – mobilsite

Dette er en statisk GitHub Pages-side med Firebase Realtime Database og anonym innlogging. Opptil åtte personer spiller fra hver sin telefon. Den som oppretter rommet, må holde siden åpen under spillet, siden denne klienten driver den automatiske rundestyringen.

## Oppsett kun med mobil

1. Gå til https://console.firebase.google.com/ og opprett et Firebase-prosjekt.
2. Legg til en **Web app** (ikonet `</>`). Kopier `firebaseConfig`-verdiene til `firebase-config.js`.
3. I **Authentication → Sign-in method** aktiver **Anonymous**.
4. I **Realtime Database** opprett database og kopier dens URL til `databaseURL` i `firebase-config.js`.
5. I **Realtime Database → Rules** lim inn innholdet fra `database.rules.json` og publiser reglene. Merk: Dette er demonstrasjonsregler, ikke produksjonssikkerhet. Alle anonyme innloggede klienter kan lese og skrive spillrom. Ikke legg inn sensitive opplysninger.
6. I dette repositoriet publiseres siden fra `main` og `/ (root)` under **Settings → Pages**.
7. Etter publisering åpner spillerne `https://henhansen-max.github.io/kveldens-dummeste/` på mobilene.

## Spilleregler

- 2–8 spillere. Felles romkode på seks tegn; hver telefon identifiseres av en unik anonym Firebase-bruker.
- Tre spørsmål per runde, 20 sekunder per spørsmål.
- Den som får flest riktige, ryker ut. Ved likhet teller raskest svartid, deretter påloggingsrekkefølge.
- Spillvertens telefon styrer tid og rundeskifter automatisk og må være pålogget.
- Spillet har 40 originale spørsmål og er uoffisielt.

## Begrensninger før offentlig bruk

Firebase-reglene i pakken er åpne for alle anonyme brukere. Dette er en enkel prototype og kan manipuleres. For offentlig eller kommersiell lansering må autorisasjon, serverstyrt tidtaking, datavalidering, opprydding av gamle rom og misbruksvern flyttes til en sikker backend. Gratisnivåer kan ha kvoter.
