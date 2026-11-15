# Status

Senast uppdaterad 2026-11-15 (mobilkraschen).

## Klart

- **Steg 1, teknisk spik.** GPT-SW3 126M räknar i webbläsaren. Tokeniseraren är konverterad till `tokenizer.json` (identiska bitar som originalet i alla testmeningar) och modellen till ONNX (259 MB). Den krympta modellen ger samma toppval som originalet i PyTorch i 299 av 299 positioner. Testsidan finns kvar på `/spik.html`. Skripten och kommandona står i `scripts/README.md`.
- **Steg 2, förberäknad data** (`public/data/`). Galaxen: alla 64 000 bitars ordvektorer projicerade till 3D med UMAP, grannar uträknade i det riktiga rummet. Fil-exemplet: vinklar mellan vektorerna lager för lager, och attention. Reservexempel för steg 2 och 5–7.
- **Steg 3, partikelsystemet och scrollskelettet.** 64 000 partiklar, en per bit i modellens ordförråd, byter form: hjärna, moln, galax, tolv lager, solfjäder, ström och galax igen. Alla nio steg finns med reglage.
- **Steg 4, modellen inkopplad.** Egen mening, bitar, sannolikheter, slump och hallucination räknas live när modellen är laddad. Innan dess visas de förberäknade exemplen.
- **Ett första utkast till alla texter** och rutorna "Så här är det egentligen" (steg 5 i planen). De behöver läsas av Vidar och granskas.

- **Modellen ligger på Hugging Face:** [HuggingVidar/gpt-sw3-126m-onnx](https://huggingface.co/HuggingVidar/gpt-sw3-126m-onnx), med licens, riktlinjer och ett modellkort som beskriver ändringarna. Sidan hämtar modellen därifrån (se `src/model/config.js`), provkört i webbläsare 2026-11-14.

- **Felet "Något gick fel när sidan laddades" är rättat** (2026-11-15). Fem datafiler i `public/data/` (`galaxy.bin`, `words.bin`, `neighbors.bin`, `neighbors_sim.bin`, `examples_logits.bin`, sammanlagt 1,9 MB) hade aldrig kommit in i Git, eftersom `.gitignore` stängde ute alla `.bin`-filer. Vercel bygger från GitHub och fick därför inte med dem. Filerna är framräknade på nytt med `build_galaxy.py` och `precompute.py`. Kontroll: samma körning gav `vocab.json`, `examples.json` och `fil.json` byte för byte identiska med de som redan låg i Git. `.gitignore` har nu ett undantag för `public/data/*.bin`, och sidan säger i konsolen vilken fil som saknas om det händer igen. Galaxens form kommer från en ny UMAP-körning med samma slumpfrö, så den kan skilja sig lite från den som visades lokalt tidigare.

- **Sidan ligger på Vercel:** https://insidan-av-ai.vercel.app (projektet `insidan-av-ai`, kopplat till GitHub-repot). Första uppläggningen gjordes från arbetsgrenen och hamnade som produktionsversion, eftersom projektet saknade en sådan. Kontrollerat: den byggda sidan, datafilerna och sidhuvudena för flera processorkärnor levereras. Inte provat i en webbläsare från byggmiljön, eftersom den inte når vercel.app.

- **Ombyggd till en kameraåkning inåt** (2026-11-15), efter Vidars två invändningar: för lite häpnad, och känslan av att scrolla mellan olika sidor. Besluten står i `docs/PLAN.md` under "Ändrad riktning". Det som är gjort:
  - Inget innehåll scrollar längre. Varje scen är en sträcka att scrolla, och scrollen flyttar kameran (`updateProgress` i `src/main.js`, `view()` i `src/scene/stage.js`).
  - Resan: utanför hjärnan, in genom ytan, runt i rummet av bitar, från bit till bit längs din mening, till ett sökt ord, genom tolv lager som en tunnel, ut till solfjädern, igenom den in i strömmen, och ut igen.
  - Djup i bilden: punkter långt bort bleknar, punkter nära blir stora och mjuka, och de allra närmaste tonas bort.
  - Meningen skrivs i inledningen. Texten står som undertexter, reglagen i en list, och mitt i en övergång är bilden helt ren.
  - Siffror i bilden: likhetstal vid grannarna till ett sökt ord, och likheten mellan de tre trådarna för "fil" efter varje lager (uppmätta värden, inga mellanvärden).
  - Tangentbord: den som tabbar till ett reglage i en annan scen åker dit. Vid minskad rörelse byter bilden mellan fasta lägen utan åkning.
  - Provat i en webbläsare utan grafikkort i byggmiljön, i 1280 × 720 och i mobilbredd, utan fel i konsolen. Inte provat: riktig dator med grafikkort, modellen laddad, skärmläsare.

- **Kraschen på mobil är åtgärdad** (2026-11-15). Vidars iPhone (Chrome) visade "Det går inte att öppna den här sidan" varje gång, efter att modellen hade sparats. Orsaken var minnet. Uppmätt i Chromium på dator, bara modellen utan partiklar: **2,2 GB** som mest för en fil på 259 MB. Nedladdningen stod för cirka 600 MB av det och ONNX Runtime för resten. Den förberäknar alla vikter som 32-bitarstal (543 MB), gör en vänd kopia av ordtabellen (197 MB) och kopierar vikterna ur filen en gång till. Det här är gjort:
  - **På mobil och surfplatta startar modellen bara när man trycker på knappen**, även när den redan är sparad. Knappen säger då "Starta modellen (redan hämtad)".
  - **Ny modellfil på Hugging Face**, med samma vikter byte för byte: `onnx/model_split.onnx` (grafen) och `onnx/model_split.onnx_data` (vikterna). Vikterna ligger i en egen fil, och sista steget görs med Gemm i stället för en vänd kopia. Skriptet är `scripts/split_onnx.py`. Kontroll: samma logits som `model.onnx` (skillnad 0). Den gamla filen ligger kvar.
  - **Snålt läge på mobil**: vikterna görs om till 32 bitar först när de används. Logits skiljer högst 0,00003, och toppvalen är desamma. Priset är att varje ny bit tar ungefär dubbelt så lång tid. WebGPU provas inte i snålt läge.
  - **Nedladdningen** läses rakt in i en enda buffert. Första gången flödar filen till webbläsarens cache och läses sedan tillbaka, så filen finns bara en gång i minnet åt gången. Den gamla cachen (`inuti-sprakmodellen-v1`, 259 MB) tas bort.
  - **Om WebGPU misslyckas** släpps den halvfärdiga modellen innan WebAssembly provas.
  - **Om starten misslyckas** säger sidan lugnt att den visar färdiga exempel i stället. En telefon som får slut på minne stänger hela fliken utan att någon felhantering hinner köras. Därför lägger sidan en lapp i webbläsarens lagring före starten. Finns lappen kvar nästa gång, säger sidan att förra försöket inte blev klart och startar inte modellen av sig själv, inte heller på dator.
  - Uppmätt toppminne för hela sidan i Chromium: dator 1,8 GB (förut 2,2 GB plus sidan). Mobilläge (emulerad iPhone): 1,2 GB vid start från cachen och 1,4 GB vid första nedladdningen. Fart på dator i WebAssembly: 88 ms per ny bit i vanligt läge och 170–200 ms i snålt läge.
  - **Inte provat**: en riktig iPhone. Apple anger ingen fast minnesgräns för en flik i Safari eller Chrome på iPhone.

## Nästa steg

0. **Vidar provar på sin iPhone** (PR:en med mobilrättningen). Sidan ska alltid gå att öppna. Tryck sedan på knappen och se om modellen startar eller om det lugna meddelandet visas.
1. **Texter (steg 5).** Utkasten gäller tills vidare. Vidar redigerar dem senare med Opus.
2. **Vidar provar den nya resan** och säger vad som känns rätt och fel: tempo, ljus, hur länge varje scen varar.
3. **Finputs (steg 6).** Mobilvyn är grovt gjord: listen med reglage tar stor plats. Prova också på en svag dator och med skärmläsare.
4. **Granskning (steg 7)** av en fristående session, särskilt påståendena under "Att kontrollera" nedan.
5. **Publicering (steg 8).** Sidan ligger redan uppe som förhandsversion. Kvar: lägg in arbetet i huvudgrenen `main` (Vercel bygger produktionsversionen därifrån), bestäm adress och länka från aifolkbildaren.se.

## Beslut

- **Fri text är på** (Vidar, 2026-11-14). Adressen `?visning` ger ett visningsläge med bara färdiga meningar. De förberäknade exemplen är filtrerade, live-text är det inte.

## Avvikelser från planen

- **Transformers.js används inte som helhet.** Sidan använder dess två byggstenar direkt: `@huggingface/tokenizers` och `onnxruntime-web`. Det gav full kontroll över sannolikheterna och slumpen och en mindre sida. GSAP behövdes inte, scrollen sköts med egen kod.
- **Steg 2 jämför två tokeniserare**, inte bara svenska mot engelska. Med GPT-SW3:s nordiska tokeniserare blir svenska inte fler bitar än engelska (6 mot 7 i exemplet). Poängen syns i stället när samma svenska mening klyvs av GPT-2:s engelska tokeniserare (13 bitar). Språkbytet finns kvar för de färdiga meningarna.
- **16-bitars lagring i stället för 8-bitars.** En vanlig 8-bitarsmodell (177 MB) gav samma toppval i bara 65 procent av positionerna och sköt sannolikheterna med upp till 9 procentenheter. Filen på 259 MB ger samma siffror som originalet.
- **Attention i steg 4 visas utan meningens första bit.** I den här modellen hamnar omkring 70 procent av vikten där. Det står i rutan.
- **Det förberäknade hallucinationsexemplet** handlar om ett påhittat Nobelpris i stället för en påhittad bok. Med boken skrev modellen ut namn på verkliga författare.
- **Ingen glödeffekt (bloom).** Den lade en grå dimma över bilden och kostar prestanda på svaga datorer. Djupet görs i stället i partiklarnas egen shader.
- **Strömmen i hallucinationsscenen** är ett rör av partiklar runt kameran, inte ett band bakom texten.

## Att kontrollera (granskningen)

- Modellen heter 126M, men filen innehåller 135 753 216 tal. Sidan säger "ungefär 136 miljoner". Stämmer det med hur AI Sweden räknar?
- "ChatGPT och andra chattbotar är mycket större" och "kan ofta söka på webben och hänvisa till källor" (steg 1 och 8). Rimligt, men inga siffror anges.
- Beskrivningen av hur bitarna tas fram (steg 2) är en förenkling av BPE.
- Påståendet att forskare är oeniga om vad attention-vikter förklarar (steg 4) saknar källa på sidan.
- "Stockholm får omkring 3 procent" (steg 5) är uträknat: 3,4 procent.

- Nya påståenden i texten: "Ordningen följer uträkningen: först bitarna, sedan lagren och sist sannolikheterna" (scen 1) och "Lagren är inga skivor i ett rum. Ett lager är ett steg i uträkningen" (scen 4).
- Slutraden "Någon hjärna fanns det inte, bara en uträkning" är en formulering att ta ställning till.

## Öppna frågor

- **Kan modellen alls köras på en iPhone?** Osäkert. Även i snålt läge behöver den drygt 1 GB, och det är inte provat på en riktig telefon. Vidar provar. Om det inte går finns tre förslag: (a) mobilen visar bara de färdiga exemplen, och knappen ersätts av en mening om att den levande modellen kräver en dator; (b) fler färdiga meningar, så att mobilen får mer att välja på; (c) en mindre modellfil för mobil, till exempel 8-bitarsvikter med MatMulNBits. Förslag c måste kontrolleras mot originalet, eftersom den 8-bitarsvariant som provades tidigare bara gav samma toppval i 65 procent av positionerna.
- **Cachen på iPhone.** Koden flödar filen direkt till webbläsarens cache. Om Safari på iPhone inte klarar det, hämtar koden filen en gång till utan cache, och då laddas 259 MB ner två gånger. Inte provat.

- **Tempot i resan.** Hela sidan är ungefär 30 skärmhöjder att scrolla. Längden per scen står som `--len` i `index.html` och är lätt att ändra.
- **Prestanda på svag dator.** Punkter nära kameran ritas stora, och det kostar mer än förut. Inte mätt på riktig hårdvara.

- **Nedladdningen på 259 MB.** På dator hämtas modellen automatiskt, på mobil och i datasparläge först när besökaren trycker på knappen (på mobil även när den redan är sparad). Är det rätt avvägning?
- **GPT-2:s tokeniserare** (1,4 MB, MIT-licens) ligger i `public/data/`. Vill vi ha jämförelsen?
- **AI Swedens licens** är läst. Vidaredistribution av ändrade versioner är tillåten om licensen och riktlinjerna följer med, upphovet anges (AI Sweden, RISE, WASP), ändringarna beskrivs och inget antyder att de står bakom versionen. Det är gjort i modellkortet och i sidfoten. Licensen kräver också att användare av en tjänst som bygger på modellen får veta det och kan nå villkoren: sidfoten länkar dit. En jurist har inte läst detta.
- Från planen, fortfarande öppna: licens för sidan, namn och adress, engelsk version.

## Bra att veta för nästa session

- Molnmiljön heter `insidan-av-ai` och har åtkomst till Hugging Face. Hämta med `HF_HUB_DISABLE_XET=1`.
- Modellfilerna finns inte i Git. Sidan hämtar dem från Hugging Face. Miljön har en sparad skrivnyckel för `huggingface.co`, som proxyn sätter in automatiskt.
- Starta med `npm install` och `npm run dev`. `?ingenmodell` stänger av modellen, `?backend=wasm` tvingar WebAssembly och `?snal` ger mobilens snåla läge på dator.
- Sidan hämtar `onnx/model_split.onnx` och `onnx/model_split.onnx_data` (se `src/model/config.js`). Lokalt: lägg dem i `public/models/gpt-sw3-126m/onnx/` tillsammans med `tokenizer.json` och `tokenizer_config.json`, och starta med `VITE_MODEL_BASE=/models/gpt-sw3-126m/ npm run dev`.
- Minnet mäts enklast med Playwright: läs av processen `--type=renderer` med `ps` medan modellen startar. En tillfällig Playwright-profil har lite lagringsutrymme, så där sparas modellen aldrig i cachen. Använd `launchPersistentContext` för att prova cachen.
- WebGPU är inte provat (testmiljön har inget grafikkort). Koden väljer WebGPU när det finns och provkör en gång innan den litar på det.
