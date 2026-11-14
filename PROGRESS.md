# Status

Senast uppdaterad 2026-11-14.

## Klart

- **Steg 1, teknisk spik.** GPT-SW3 126M räknar i webbläsaren. Tokeniseraren är konverterad till `tokenizer.json` (identiska bitar som originalet i alla testmeningar) och modellen till ONNX (259 MB). Den krympta modellen ger samma toppval som originalet i PyTorch i 299 av 299 positioner. Testsidan finns kvar på `/spik.html`. Skripten och kommandona står i `scripts/README.md`.
- **Steg 2, förberäknad data** (`public/data/`). Galaxen: alla 64 000 bitars ordvektorer projicerade till 3D med UMAP, grannar uträknade i det riktiga rummet. Fil-exemplet: vinklar mellan vektorerna lager för lager, och attention. Reservexempel för steg 2 och 5–7.
- **Steg 3, partikelsystemet och scrollskelettet.** 64 000 partiklar, en per bit i modellens ordförråd, byter form: hjärna, moln, galax, tolv lager, solfjäder, ström och galax igen. Alla nio steg finns med reglage.
- **Steg 4, modellen inkopplad.** Egen mening, bitar, sannolikheter, slump och hallucination räknas live när modellen är laddad. Innan dess visas de förberäknade exemplen.
- **Ett första utkast till alla texter** och rutorna "Så här är det egentligen" (steg 5 i planen). De behöver läsas av Vidar och granskas.

## Nästa steg

1. **Vidar: skaffa ett konto på Hugging Face** och en nyckel med skrivrätt, så att modellfilerna kan läggas upp där. Utan det fungerar den riktiga modellen bara i utvecklingsmiljön. När filerna ligger uppe sätts `VITE_MODEL_BASE` till mappens adress (se `src/model/config.js`).
2. **Texter (steg 5).** Utkasten gäller tills vidare. Vidar redigerar dem senare med Opus.
3. **Finputs (steg 6).** Mobilvyn är bara grovt gjord: bilden hamnar bakom textrutan i flera steg. Prova också på en svag dator och med skärmläsare.
4. **Granskning (steg 7)** av en fristående session, särskilt påståendena under "Att kontrollera" nedan.
5. **Publicering (steg 8)** på Vercel.

## Beslut

- **Fri text är på** (Vidar, 2026-11-14). Adressen `?visning` ger ett visningsläge med bara färdiga meningar. De förberäknade exemplen är filtrerade, live-text är det inte.

## Avvikelser från planen

- **Transformers.js används inte som helhet.** Sidan använder dess två byggstenar direkt: `@huggingface/tokenizers` och `onnxruntime-web`. Det gav full kontroll över sannolikheterna och slumpen och en mindre sida. GSAP behövdes inte, scrollen sköts med egen kod.
- **Steg 2 jämför två tokeniserare**, inte bara svenska mot engelska. Med GPT-SW3:s nordiska tokeniserare blir svenska inte fler bitar än engelska (6 mot 7 i exemplet). Poängen syns i stället när samma svenska mening klyvs av GPT-2:s engelska tokeniserare (13 bitar). Språkbytet finns kvar för de färdiga meningarna.
- **16-bitars lagring i stället för 8-bitars.** En vanlig 8-bitarsmodell (177 MB) gav samma toppval i bara 65 procent av positionerna och sköt sannolikheterna med upp till 9 procentenheter. Filen på 259 MB ger samma siffror som originalet.
- **Attention i steg 4 visas utan meningens första bit.** I den här modellen hamnar omkring 70 procent av vikten där. Det står i rutan.
- **Det förberäknade hallucinationsexemplet** handlar om ett påhittat Nobelpris i stället för en påhittad bok. Med boken skrev modellen ut namn på verkliga författare.
- **Ingen glödeffekt (bloom).** Den lade en grå dimma över bilden och kostar prestanda på svaga datorer.

## Att kontrollera (granskningen)

- Modellen heter 126M, men filen innehåller 135 753 216 tal. Sidan säger "ungefär 136 miljoner". Stämmer det med hur AI Sweden räknar?
- "ChatGPT och andra chattbotar är mycket större" och "kan ofta söka på webben och hänvisa till källor" (steg 1 och 8). Rimligt, men inga siffror anges.
- Beskrivningen av hur bitarna tas fram (steg 2) är en förenkling av BPE.
- Påståendet att forskare är oeniga om vad attention-vikter förklarar (steg 4) saknar källa på sidan.
- "Stockholm får omkring 3 procent" (steg 5) är uträknat: 3,4 procent.

## Öppna frågor

- **Nedladdningen på 259 MB.** På dator hämtas modellen automatiskt, på mobil och i datasparläge först när besökaren trycker på knappen. Är det rätt avvägning?
- **GPT-2:s tokeniserare** (1,4 MB, MIT-licens) ligger i `public/data/`. Vill vi ha jämförelsen?
- Från planen, fortfarande öppna: licens för sidan, AI Swedens licensvillkor (läs i sin helhet före publicering, modellkort och licens ska följa med filerna på Hugging Face), namn och adress, engelsk version.

## Bra att veta för nästa session

- Molnmiljön heter `insidan-av-ai` och har åtkomst till Hugging Face. Hämta med `HF_HUB_DISABLE_XET=1`.
- Modellfilerna finns inte i Git. I en ny session måste de antingen hämtas från Hugging Face (när de ligger där) eller byggas om med skripten (cirka fem minuter).
- Starta med `npm install` och `npm run dev`. `?ingenmodell` stänger av modellen, `?backend=wasm` tvingar WebAssembly.
- WebGPU är inte provat (testmiljön har inget grafikkort). Koden väljer WebGPU när det finns och provkör en gång innan den litar på det.
