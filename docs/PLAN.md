# Inuti språkmodellen – projektplan

Senast uppdaterad 2026-11-14.

## Syfte och målgrupp

*Inuti språkmodellen* är en svensk webbsida som man scrollar sig igenom. Den visar en lekman vad som händer från att man skriver en fråga till att svaret kommer, och en riktig liten språkmodell räknar i webbläsaren medan man tittar. Den är både ett utbildningsmaterial och AI-Folkbildarens flaggskepp i portfolion.

**Målgrupp:** bibliotekarier, deltagare i studieförbund och nyfikna biblioteksbesökare. De har inga förkunskaper i teknik, men har använt ChatGPT eller liknande.

**Användning:** i Vidars kurser och dragningar, som länk från aifolkbildaren.se och som fritt material som andra bibliotek och studieförbund kan visa (öppen licens, se öppna frågor).

**Efter besöket ska besökaren kunna säga:**

1. Modellen läser inte ord, utan bitar av ord (tokens).
2. Ord blir punkter i ett rum där närhet betyder "används i liknande sammanhang", inte "betyder samma sak".
3. Modellen väljer nästa bit efter sannolikhet. Den slår inte upp fakta.
4. Samma fråga kan ge olika svar, eftersom en del av valet är slump.
5. En text som låter säker är inte därför sann, och därför behövs källkritik även när svaret låter rätt.

## Den visuella idén: hjärnan som faller isär

Sidan börjar med den klassiska bilden av en hjärna av glödande noder och visar sedan att bilden är fel. Hjärnan är inspirerande men vilseledande. Den får modellen att verka tänkande och medveten, och det är just den förmänskligande bilden som MIK-arbete ska motverka. Att använda den okritiskt vore att gå emot sitt eget budskap.

**Grepp:** första skärmen är en hjärna i 3D, uppbyggd av tusentals partiklar. När besökaren scrollar löses hjärnan upp. Samma partiklar flyger isär och ordnar om sig till det som faktiskt finns där inne:

- **Betydelserummet som en galax.** Partiklarna blir ord, och ord som används i liknande sammanhang hamnar nära varandra. Här får Bokgalaxens bildspråk sitt hem, och dessutom är bilden korrekt: ett betydelserum är bokstavligen punkter i ett rum.
- **Lagren som en ström.** Partiklarna sträcker ut sig till staplade lager som texten passerar igenom, ett i taget. Det är en fabrik och inte en hjärna.
- **Utfallet som en solfjäder.** I slutet sprids partiklarna ut i en solfjäder av möjliga nästa ord, där ljusstyrkan visar sannolikheten.

Hela sidan är alltså ett och samma partikelsystem som byter form. Det är det som gör sidan visuellt imponerande och samtidigt sammanhängande.

**Bildspråk:** mörk bakgrund, glödande partiklar och en accentfärg som följer "din" text genom hela förloppet, så att besökaren alltid ser var den egna frågan befinner sig.

## Berättelsens steg

Sidan har nio scrollsteg som följer en och samma mening, den som besökaren själv skriver, från inmatning till svar. Steg 2, 5, 6 och 7 bygger på riktiga beräkningar. Övriga steg är förklarande animationer.

| Steg | Vad besökaren ser och gör | Vad hen ska förstå |
| --- | --- | --- |
| 0. Hjärnmyten | En partikelhjärna som löses upp vid scroll. | Bilden är en metafor, och en vilseledande sådan. |
| 1. Din mening | Skriver en egen början på en mening eller väljer ett exempel, till exempel "Biblioteket i Västervik ligger". | Allt börjar med text, och ingenting annat. |
| 2. Tokens | Meningen klyvs i färgade bitar av en riktig tokeniserare. Ett reglage jämför med samma mening på engelska. | Modellen ser bitar och inte ord. Svenska blir ofta fler bitar än engelska. |
| 3. Betydelserummet | Bitarna flyger ut i galaxen. Besökaren kan söka ett ord och se dess grannar. | Närhet betyder att orden används i liknande sammanhang, inte att de betyder samma sak. |
| 4. Sammanhanget | Ordet "fil" visas i tre meningar (yoghurt, körfält, dator) och hamnar på olika platser efter att ha passerat lagren. Linjer visar vilka ord som påverkar vilka. | Orden runt omkring ändrar vad ett ord betyder för modellen. |
| 5. Nästa ord | En solfjäder med de tio mest sannolika nästa bitarna och deras sannolikheter, beräknade på riktigt. | Modellen väljer det sannolika. Den slår inte upp något. |
| 6. Slumpen | Ett temperaturreglage och en knapp för att köra igen. Samma start ger olika fortsättningar. | Samma fråga kan ge olika svar, och det är en inbyggd egenskap, inte ett fel. |
| 7. Hallucinationen | Modellen får fortsätta en mening om något som inte finns, till exempel en påhittad bok. Den skriver flytande ändå, med höga sannolikheter. | Att en text flyter visar inte att den är sann. |
| 8. Vad betyder det för dig? | Några källkritiska frågor att ta med sig, kort om hur stora chattbotar skiljer sig från den lilla modellen, och en länk till AI-Folkbildaren. | Samma princip gäller i ChatGPT, och därför behövs källkritik. |

## Teknik

En statisk webbplats där språkmodellen körs i besökarens webbläsare via Transformers.js. Det behövs ingen server, inga API-kostnader, och besökarens text lämnar aldrig datorn, vilket är ett bra argument i sig när man pratar integritet. Georgia Techs [Transformer Explainer](https://github.com/poloclub/transformer-explainer) visar att upplägget fungerar. Den kör GPT-2 i webbläsaren, men på engelska och för en mer teknisk publik.

**Modellval.** Det här är det största tekniska frågetecknet, och Fable-sessionen ska börja med att prova båda kandidaterna.

| Modell | Svenska | Licens | Klar för webbläsaren? |
| --- | --- | --- | --- |
| [GPT-SW3 126M](https://huggingface.co/timpal0l/gpt-sw3-126m) (AI Sweden), basmodell | Tränad på nordiska språk med en egen nordisk tokeniserare, vilket gör steg 2 tydligt. | [AI Swedens licens](https://scancode-licensedb.aboutcode.org/ai-sweden-llm-ai-model-2023.html), en modifierad RAIL-licens. Vidaredistribution är tillåten med källhänvisning. | Nej. Den måste konverteras till ONNX och vikterna läggas upp på ett eget Hugging Face-konto, eftersom originalet kräver inloggning. |
| Qwen2.5-0.5B-Instruct | Fungerar, men svagare. Tokeniseraren är inte byggd för svenska. | Öppen licens | Ja, det finns färdiga ONNX-versioner för Transformers.js. |

Förstahandsvalet är GPT-SW3 126M som basmodell. En basmodell fortsätter bara text och svarar inte som en chattbot, och det är just det sidan vill visa. Att den är svensk och liten (snabb att ladda) är också en berättelse i sig. Om konverteringen strular är Qwen reserv.

**Inre data för steg 3 och 4.** Den vanliga textgenereringen i Transformers.js ger sannolikheter för nästa bit (steg 5 till 7), men inte modellens inre lager. Det finns två vägar:

- Galaxen i steg 3 byggs i förväg. Modellens ordvektorer projiceras till 3D en gång och sparas som en fil. Det är riktig data från modellen, bara förberäknad.
- För steg 4 görs en egen ONNX-export som också ger ut attention och inre tillstånd, så som Transformer Explainer gjorde. Alternativt räknas de tre "fil"-meningarna ut i förväg.

**Stack:** Vite och Three.js för partikelsystemet, scrollstyrda animationer (till exempel GSAP ScrollTrigger) och [Transformers.js](https://pinggy.io/blog/run_llm_in_browser_webgpu/) i en Web Worker. Den använder WebGPU där det finns och WebAssembly som reserv. Sidan publiceras på Vercel eller GitHub Pages, och modellfilerna ligger på Hugging Face, eftersom de är för stora för GitHub.

**Robusthet:** sidan ska fungera innan modellen har laddats. Alla steg visar först ett förberäknat exempel, modellen laddas i bakgrunden med en tydlig förloppsindikator, och sedan blir den egna meningen live. På mobil och på svaga bibliotekdatorer visas bara de förberäknade exemplen.

## Krav på förenklingarna

Sidan får förenkla men inte påstå något som är fel. En tekniskt kunnig läsare ska kunna granska den utan att hitta något att anmärka på. Det är en fråga om trovärdighet för en tjänst som säljer källkritik.

- **Varje förenkling markeras.** Under varje steg finns en fällbar ruta, "Så här är det egentligen", med en mer exakt förklaring i några meningar.
- **Inget förmänskligande språk.** Inte "modellen förstår", "tänker", "vet" eller "tycker". Skriv i stället "räknar fram", "ger hög sannolikhet" eller "har sett i träningstexten". Inga "neuroner som i hjärnan".
- **Inga populära men vilseledande exempel.** Beräkningen "kung − man + kvinna = drottning" används inte. Den bygger på utvalda exempel och fungerar sämre än den brukar framställas.
- **Galaxen förvränger.** Betydelserummet har hundratals dimensioner, och 3D-bilden är en projektion. Det står i rutan.
- **Linjerna i steg 4 är inte en förklaring.** Attention-vikter visar var modellen "tittar", men forskningen är oenig om hur mycket de förklarar. Formulera försiktigt.
- **En liten modell är inte ChatGPT.** Den lilla modellen hallucinerar mycket mer. Steg 8 måste säga att stora modeller gör det mer sällan, men att grundorsaken är densamma. Annars blir slutsatsen "AI hittar alltid på", vilket också är fel.
- **Tillgänglighet.** Målet är WCAG 2.1 AA: tangentbordsnavigering, en kort textbeskrivning per steg för skärmläsare och ett lugnt läge utan rörelse när besökaren har valt minskad rörelse i sina inställningar.
- **Granskning.** Vidar läser alla texter. Innan sidan publiceras granskar en fristående AI-session som inte har byggt sidan alla påståenden i rutorna. Helst läser också en människa med ML-bakgrund dem.

## Arbetsordning i Claude Code

Det riskablaste görs först, och med Fable: att få en riktig modell att räkna i webbläsaren. Om krediterna tar slut halvvägs finns den svåra kärnan då redan på plats, och resten kan Opus bygga vidare på.

1. **Teknisk spik (Fable).** Konvertera GPT-SW3 126M till ONNX och ladda den i en enkel testsida. Visa tokens och de tio mest sannolika nästa bitarna. Om det inte fungerar inom rimlig tid byts modellen till Qwen. Ingen grafik i det här steget.
2. **Förberäknad data (Fable).** Projicera ordvektorerna för några tusen vanliga svenska ord till 3D för galaxen och räkna ut "fil"-exemplet för steg 4.
3. **Partikelsystemet och scrollskelettet (Fable).** Samma partiklar byter form: hjärna, galax, lager och solfjäder. Texterna är platshållare. Det här är det visuellt avgörande steget.
4. **Koppla in modellen (Fable).** Den riktiga modellen kopplas in i steg 2, 5, 6 och 7, och den förberäknade reserven blir kvar.
5. **Texter (Opus).** Ett textavsnitt per steg och rutorna "Så här är det egentligen", enligt kraven ovan.
6. **Finputs (Opus).** Mobil, tillgänglighet, laddningen och prestanda på svaga datorer.
7. **Granskning (fristående session).** Fakta i rutorna kontrolleras, liksom tillgänglighet och hur sidan fungerar i olika webbläsare.
8. **Publicering.** På Vercel med en vercel.app-adress, och sidan länkas från aifolkbildaren.se när den finns.

**Filer som håller ordning mellan sessionerna:** `CLAUDE.md` är kort och laddas i varje session, med regler och pekare. Den här planen ligger i `docs/PLAN.md` och läses vid behov. `PROGRESS.md` uppdateras och committas efter varje steg, så att en ny session, eller en annan modell, kan fortsätta där förra slutade.

## Öppna frågor

- [ ] **Fri text eller förvalda meningar?** En basmodell kan fortsätta med olämpligt innehåll. Ska det finnas ett visningsläge med bara förvalda exempel, för storbildsskärm och publika dragningar?
- [ ] **Licens för sidan.** Förslag: CC BY 4.0 för texterna och MIT för koden, så att andra fritt kan visa och anpassa sidan.
- [ ] **AI Swedens licens.** Läs användningsvillkoren för GPT-SW3 i sin helhet innan sidan publiceras. RAIL-licenser har listor över förbjuden användning, och modellkortet ska följa med.
- [ ] **Namn och adress.** Ska sidan heta *Inuti språkmodellen*? Ska den senare ligga på en egen underdomän till aifolkbildaren.se?
- [ ] **Språk.** Svenska först. Ska det finnas en engelsk version senare?

## Källor

- [Transformer Explainer, Georgia Tech (GitHub)](https://github.com/poloclub/transformer-explainer)
- [Transformer Explainer, artikel i AAAI](https://ojs.aaai.org/index.php/AAAI/article/view/35347)
- [GPT-SW3 126M, modellkort](https://huggingface.co/timpal0l/gpt-sw3-126m)
- [AI Swedens licens för GPT-SW3](https://scancode-licensedb.aboutcode.org/ai-sweden-llm-ai-model-2023.html)
- [Transformers.js och WebGPU i webbläsaren, 2026](https://pinggy.io/blog/run_llm_in_browser_webgpu/)
- [Stöd för WebGPU i webbläsare, 2026](https://dev.to/pockit_tools/running-llms-in-the-browser-webgpu-transformersjs-and-chromes-built-in-ai-explained-5g18)
