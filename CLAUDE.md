# Inuti språkmodellen

En interaktiv svensk sida som man scrollar sig igenom. Den visar en lekman vad som händer inuti en språkmodell, från en mening till nästa ord, och en riktig liten modell räknar i webbläsaren. Målgruppen är bibliotekarier, deltagare i studieförbund och biblioteksbesökare utan teknisk bakgrund. Sidan är ett flaggskepp i AI-Folkbildarens portfolio.

## Läs först

- `PROGRESS.md`: var projektet står. Läs den i början av varje session.
- `docs/PLAN.md`: hela planen. Läs bara avsnittet för steget du arbetar med, inte hela filen varje gång.

## Stack

- Vite och Three.js, med ett enda partikelsystem som byter form: hjärna, galax, lager och solfjäder.
- Scrollstyrda animationer, till exempel GSAP ScrollTrigger.
- Transformers.js i en Web Worker, med WebGPU och WebAssembly som reserv.
- Modell: GPT-SW3 126M som basmodell, konverterad till ONNX, med vikterna på Hugging Face. Reserv: Qwen2.5-0.5B-Instruct.
- En statisk sida på Vercel. Ingen server och inga API-nycklar.

## Regler som alltid gäller

- All text på sidan är på svenska och skriven för lekmän.
- Inget förmänskligande språk. Skriv inte "förstår", "tänker", "vet" eller "tycker". Skriv "räknar fram", "ger hög sannolikhet" eller "har sett i träningstexten".
- Varje förenkling får en fällbar ruta, "Så här är det egentligen".
- Hitta aldrig på siffror eller påståenden om hur modeller fungerar. Om du är osäker, skriv det som en öppen fråga i `PROGRESS.md`.
- Sidan ska fungera innan modellen har laddats. Varje steg har ett förberäknat exempel som reserv.
- Tillgänglighet: tangentbordsnavigering, en textbeskrivning per steg och respekt för `prefers-reduced-motion`. Målet är WCAG 2.1 AA.
- Modellvikter och andra stora filer läggs aldrig i Git.

## Arbetssätt

- Ta ett steg i taget enligt arbetsordningen i `docs/PLAN.md`. Ingen grafik innan modellen räknar i webbläsaren (steg 1).
- När ett steg är klart: uppdatera `PROGRESS.md` med vad som är klart, nästa steg och öppna frågor, och committa sedan.
- Vidar är inte utvecklare. Förklara terminalkommandon och Git-steg i klarspråk, ett i taget, och säg vad han ska titta efter i webbläsaren.
