# Hvem er kveldens dummeste? – mobilsite

Dette er en statisk GitHub Pages-side med Firebase Realtime Database og anonym innlogging. Opptil åtte personer spiller fra hver sin telefon. Den som oppretter rommet, må holde siden åpen under spillet, siden denne klienten driver den automatiske rundestyringen.

## Oppsett kun med mobil

1. Gå til https://console.firebase.google.com/ og opprett et Firebase-prosjekt.
2. Legg til en **Web app** (ikonet `</>`). Kopier `firebaseConfig`-verdiene til `firebase-config.js`.
3. I **Authentication → Sign-in method** aktiver **Anonymous**.
4. I **Realtime Database** opprett database og kopier dens URL til `databaseURL` i `firebase-config.js`.
5. I **Realtime Database → Rules**, lim inn innholdet fra `database.rules.json` og publiser. Vert og innmeldte spillere kan lese rommet. Verten styrer spillstatusen, og hver spiller skriver sin egen innmeldingsforespørsel og sine egne svar.
6. I dette repositoriet publiseres siden fra `main` og `/ (root)` under **Settings → Pages**.
7. Etter publisering åpner spillerne `https://henhansen-max.github.io/kveldens-dummeste/` på mobilene.

## Spilleregler

- 2–8 spillere. Felles romkode på seks tegn; hver telefon identifiseres av en unik anonym Firebase-bruker.
- Fem spørsmål per runde, med opptil 20 sekunder per spørsmål. Fasiten vises så snart alle aktive spillere har svart, eller når tiden går ut.
- Den som får flest riktige, ryker ut. Ved likhet teller raskest svartid, deretter påloggingsrekkefølge.
- Spillvertens telefon styrer tid og rundeskifter automatisk og må være pålogget.
- Verten velger Lett, Middels eller Vanskelig før start. Hvert nivå har 100 spørsmål, inkludert to bildeoppgaver. Ingen spørsmål gjentas i samme spill.
- Spillet er uoffisielt.

## Begrensninger før offentlig bruk

Spillverten styrer rundene fra sin egen telefon. Romkoden kan deles med dem som skal spille. For offentlig eller kommersiell bruk bør rundestyring, fasit og poengberegning flyttes til en backend, og gamle rom bør ryddes automatisk.

## Bildekilder

Bildene vises fra Wikimedia Commons. Opphav og lisens per bilde:

- [Rødrev](https://commons.wikimedia.org/wiki/File:Vulpes_vulpes_ssp_fulvus.jpg), Joanne Redwood, [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/).
- [Eiffeltårnet](https://commons.wikimedia.org/wiki/File:Eiffel_Tower,Paris.jpg), Commonists, [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/).
- [Koala](https://commons.wikimedia.org/wiki/File:Koala_climbing_tree.jpg), Diliff, [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/).
- [Colosseum](https://commons.wikimedia.org/wiki/File:Colosseum_in_Rome,_Italy_-_April_2007.jpg), Diliff, [CC BY-SA 2.5](https://creativecommons.org/licenses/by-sa/2.5/).
- [Axolotl](https://commons.wikimedia.org/wiki/File:Axolotl.jpg), Erzengel, public domain.
- [Al-Khazneh, Petra](https://commons.wikimedia.org/wiki/File:Al_Khazneh_Petra_edit_2.jpg), Graham Racher, perspektiv korrigert av MrPanyGoff, [CC BY-SA 2.0](https://creativecommons.org/licenses/by-sa/2.0/).
