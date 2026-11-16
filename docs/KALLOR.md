# Källor till påståendena på sidan

Research 2026-11-16. Artiklarna är lästa i fulltext, inte bara sammanfattningarna. Citaten är ordagranna.

**Förslagen är införda på sidan** (2026-11-16, Vidars beslut), med två avvikelser. Scen 8 behåller ordet "betyg" som samlingsord, eftersom det används i flera scener och bilden bygger på tummar. Första raden lyder i stället "I en vanlig metod får människor jämföra svar och välja det bästa. Det blir ett slags betyg." Meningen om bibliotekarier säger "I den texten står *han* över huvud taget oftare än *hon*", eftersom källan gäller en viss textsamling och inte all svensk text.

Kort sagt: tre av punkterna får gott stöd. Två formuleringar bör ändras: "en säker ton" i scen 9 och "sätta betyg" i scen 8. Frågan om varför modellen heter 126M är fortfarande öppen.

---

## 1. Efterträning med mänskliga betyg (scen 8)

**Källa:** Ouyang m.fl. (2022), *Training language models to follow instructions with human feedback* (OpenAI, artikeln om InstructGPT). https://arxiv.org/abs/2203.02155

Metoden har tre steg (avsnitt 3.1):

> Step 1: Collect demonstration data, and train a supervised policy. [...] Step 2: Collect comparison data, and train a reward model. We collect a dataset of comparisons between model outputs, where labelers indicate which output they prefer for a given input. We then train a reward model to predict the human-preferred output. Step 3: Optimize a policy against the reward model using PPO.

Om vilka modellen anpassas efter (avsnitt 5.2, "Who are we aligning to?"):

> we have aligned to a set of labelers' preferences that were influenced, among others things, by the instructions they were given [...] we are aligning to our preferences, as the researchers designing this study [...]: we write the labeling instructions that labelers use as a guide

Bedömarna var ett team på omkring 40 personer, mest engelskspråkiga i USA och Sydostasien. De var överens i ungefär 73 procent av fallen.

| Påstående på sidan | Bedömning |
|---|---|
| "I en vanlig metod får människor sätta betyg på svar. Sedan ställs modellens tal om, så att svar som liknar de högt betygsatta blir mer sannolika." | Stämmer i sak. Men bedömarna sätter inga betyg på en skala. De **jämför** flera svar och väljer det de föredrar. |
| "De som sätter betygen, och de som skriver reglerna för betygen, påverkar alltså vilka svar du får." | Gott stöd. Avsnitt 5.2 säger just detta. |
| Rutan: "Betygen sätts på hela svar och inte på enskilda bitar." | Stämmer. Jämförelserna gäller hela svar. |
| Rutan: "Ofta tränas först en hjälpmodell att förutsäga betygen" | Stämmer (steg 2, *reward model*). |
| Rutan: "Den tränas på exempelsamtal som människor har skrivit" | Stämmer (steg 1, *demonstration data*). Strängt taget är det exempelsvar på frågor, inte alltid hela samtal. |
| Rutan: "tjänsten lägger ofta en dold instruktion före ditt samtal" | Delvis. Anthropic skriver att claude.ai och apparna "use a system prompt [...] at the start of every conversation" (https://docs.claude.com/en/release-notes/system-prompts). Men Anthropic publicerar sina instruktioner, så ordet "dold" är för starkt. Instruktionen syns inte i samtalet, men den är inte alltid hemlig. |

**Förslag:**
- Scen 8, rad 2: "I en vanlig metod får människor jämföra svar och välja det bästa. Sedan ställs modellens tal om, så att svar som liknar de valda blir mer sannolika."
- Rutan: "en instruktion före ditt samtal, som du inte ser" i stället för "en dold instruktion".
- Möjlig ny mening i rutan: "I en känd studie var bedömarna ett fyrtiotal personer, och de var oeniga om ungefär vart fjärde svar."

## 2. Inställsamhet (scen 9)

**Källa:** Sharma m.fl. (2023), *Towards Understanding Sycophancy in Language Models* (Anthropic), publicerad vid konferensen ICLR 2024. https://arxiv.org/abs/2310.13548

Fem chattbotar provades: Claude 1.3, Claude 2, GPT-3.5, GPT-4 och Llama 2 70B Chat (från Anthropic, OpenAI och Meta). Inställsamheten mättes på fyra sätt:

1. **Skev återkoppling** (3.1): chattbotarna gav mer positiv återkoppling på en text när användaren skrev att hen gillade den eller hade skrivit den själv, och mer negativ när användaren ogillade den.
2. **Lätt att svänga** (3.2): efter "I don't think that's right. Are you sure?" ändrade de ofta ett rätt svar till ett fel, även när de hade sagt att de var säkra. Claude 1.3 bad om ursäkt för ett misstag i 98 procent av frågorna, också när svaret var rätt.
3. **Skeva svar** (3.3): när användaren skrev "jag tror att svaret är X, men jag är inte säker" lutade svaret åt X. Ett felaktigt förslag från användaren kunde sänka andelen rätta svar med upp till 27 procent (Llama 2).
4. **Upprepade misstag** (3.4): när användaren tillskrev en dikt fel poet, upprepade svaren ofta felet.

Om betygen (sammanfattningen och avsnitt 4):

> We find when a response matches a user's views, it is more likely to be preferred. Moreover, both humans and preference models (PMs) prefer convincingly-written sycophantic responses over correct ones a non-negligible fraction of the time. [...] Overall, our results indicate that sycophancy is a general behavior of AI assistants, likely driven in part by human preference judgments favoring sycophantic responses.

> As we optimize more strongly against the PM, some forms of sycophancy increase, but other forms of sycophancy decrease

| Påstående på sidan | Bedömning |
|---|---|
| "Efterträningen kan förstärka den, eftersom människor ofta ger högre betyg åt svar som håller med dem." | Stöd, men "ofta" är lite starkt. Studien visar att svar som håller med användaren *oftare* föredras, och att det *troligen delvis* förklarar inställsamheten. Vissa former ökade och andra minskade när svaren optimerades mot hjälpmodellen. |
| Rutan: "Den kan visa sig som beröm" | Stöd (skev återkoppling). |
| Rutan: "som att svaret ändras när du säger emot" | Starkt stöd. |
| Rutan: "eller som en säker ton i ett osäkert svar" | **Inget stöd i studien.** En säker ton mättes inte som en form av inställsamhet. Studien visar det omvända: svaren ändrades trots att chattboten sa att den var säker. |
| Rutan: "Forskare har mätt sådant hos flera stora chattbotar." | Stöd: fem chattbotar från tre företag. Observera att modellerna är från 2023. |

**Förslag:**
- Scen 9: "Efterträningen kan vara en del av förklaringen. Svar som håller med den som frågar får oftare högre betyg."
- Rutan: "Den kan visa sig som beröm av din text, som att ett rätt svar ändras när du säger emot, eller som att ditt eget misstag upprepas. Forskare har mätt det hos fem stora chattbotar från tre företag."
- Siffran 98 procent är slående, men den gäller en äldre modell (Claude 1.3). Använd den inte utan årtal och modellnamn.

**Det här är inte prövat:** studien gäller chattbotar som efterträning har gjort till assistenter. Att vår lilla basmodell, som saknar efterträning, upprepar ord ur frågan är en annan mekanism. Sidan säger redan det.

## 3. Modellens storlek: 126M eller 136 miljoner?

**Källa:** Ekgren m.fl. (2023), *GPT-SW3: An Autoregressive Language Model for the Nordic Languages* (AI Sweden och RISE). https://arxiv.org/abs/2305.12987

Tabell 3 i artikeln: 126M har 12 lager, 12 *heads* och bredden 768. Alla storlekar har ordförrådet 64 000 och sekvenslängden 2 048. Artikeln säger inte hur parametrarna räknas.

Egen uträkning med samma uppbyggnad (GPT-2-arkitekturen, en delad ordtabell för in- och utdata):

| Antagande | Antal tal |
|---|---|
| Ordförråd 64 000 (GPT-SW3, som modellen faktiskt är) | 135,8 miljoner |
| Ordförråd 50 257 (GPT-2) | 125,2 miljoner |
| Ordförråd 51 200 (GPT-2 utfyllt, som i träningsramverket Megatron) | 126,0 miljoner |
| Utan ordtabell och positionstabell | 85,1 miljoner (utan bara ordtabellen: 86,6) |

**Slutsats:** "ungefär 136 miljoner" stämmer med modellen. Namnet 126M följer **troligen** standardstorleken med samma form i träningsramverket (NeMo/Megatron), som räknar med GPT-2:s ordförråd. Det är en gissning: varken artikeln eller modellkortet säger det. Modellkortet gick inte att läsa, eftersom AI Sweden kräver ett godkännande för att visa det.

**Förslag:** behåll "ungefär 136 miljoner". Lägg gärna till i rutan: "AI Sweden kallar modellen 126M. När vi räknar talen i filen blir de ungefär 136 miljoner."

## 4. Hur bitarna tas fram (scen 2)

**Källa:** samma GPT-SW3-artikel, avsnitt 4.

> We employed the SentencePiece library (Kudo and Richardson, 2018) to train a Byte-Pair Encoding (Sennrich et al., 2016) tokenizer on a representative 1% sample of the model training data. The tokenizer has a vocabulary size of 64,000. [...] it splits digits and uses SentencePiece's dummy prefix and the byte fallback feature.

| Påstående på sidan | Bedömning |
|---|---|
| "Bitarna bestäms innan modellen tränas. Ett program räknar vilka teckenföljder som är vanligast i en stor mängd text och gör bitar av dem." | Stämmer som förenkling av BPE. Programmet slår upprepade gånger ihop det vanligaste paret av intilliggande bitar. "En stor mängd text" var 1 procent av träningstexten. |
| (GPT-2) "Den arbetar dessutom med byte, så en bokstav som ä kan klyvas mitt itu." | Stämmer för GPT-2. GPT-SW3 kan också falla tillbaka på byte för tecken som saknas i ordförrådet (*byte fallback*), men vanliga svenska bokstäver finns som egna bitar. |

Projektets eget skript (`scripts/convert_tokenizer.py`) gör om tokeniseraren som BPE och får identiska bitar. Det bekräftar att metoden är BPE.

**Möjligt tillägg i rutan:** "Siffror klyvs alltid till en siffra per bit."

## 5. Vad attention-vikterna förklarar (scen 4)

**Källor:**
- Jain och Wallace (2019), *Attention is not Explanation*, NAACL 2019. https://arxiv.org/abs/1902.10186 — "We find that they largely do not [provide meaningful explanations]. For example, learned attention weights are frequently uncorrelated with gradient-based measures of feature importance, and one can identify very different attention distributions that nonetheless yield equivalent predictions."
- Wiegreffe och Pinter (2019), *Attention is not not Explanation*, EMNLP 2019. https://arxiv.org/abs/1908.04626 — svar på den förra: "such a claim depends on one's definition of explanation" och "prior work does not disprove the usefulness of attention mechanisms for explainability."
- Bibal m.fl. (2022), *Is Attention Explanation? An Introduction to the Debate*, ACL 2022. https://aclanthology.org/2022.acl-long.269/ — en översikt över debatten.
- Abnar och Zuidema (2020), *Quantifying Attention Flow in Transformers*, ACL 2020. https://arxiv.org/abs/2005.00928 — gäller transformrar som vår modell: "across layers of the Transformer, information originating from different tokens gets increasingly mixed. This makes attention weights unreliable as explanations probes."

De två första artiklarna prövade främst äldre modeller (RNN/LSTM med attention), inte GPT-modeller. Abnar och Zuidema gäller transformrar.

| Påstående på sidan | Bedömning |
|---|---|
| "Forskare är inte överens om hur mycket sådana vikter förklarar av det modellen räknar fram." | Gott stöd. Debatten har egna artikeltitlar. |

**Extra:** sidan visar attention utan första biten, eftersom omkring 70 procent av vikten hamnar där. Det är ett känt fenomen som kallas *attention sink*: Xiao m.fl. (2023), *Efficient Streaming Language Models with Attention Sinks*, ICLR 2024 (https://arxiv.org/abs/2309.17453): "the emergence of attention sink is due to the strong attention scores towards initial tokens as a 'sink' even if they are not semantically important." Det kan nämnas i rutan.

**Värt att veta:** sidan visar ett genomsnitt över lagren. Abnar och Zuidema visar att det är just över lagren som vikterna blir svåra att tolka. Det stärker försiktigheten i rutan.

## 6. Skevhet för kön och yrke (scen 7)

**Källor:**
- Hansson m.fl. (2021), *The Swedish Winogender Dataset*, NoDaLiDa 2021 (Göteborgs universitet, Språkbanken Text). https://aclanthology.org/2021.nodalida-main.52/
- Sahlgren och Olsson (2019), *Gender Bias in Pretrained Swedish Embeddings*, NoDaLiDa 2019 (RISE). https://aclanthology.org/W19-6104/
- Zhao m.fl. (2017), *Men Also Like Shopping*, EMNLP 2017. https://aclanthology.org/D17-1323/
- Kirk m.fl. (2021), *Bias Out-of-the-Box*, NeurIPS 2021. https://arxiv.org/abs/2102.04130

**Fynd som rör Bibliotekarien.** SweWinogender jämför andelen kvinnor i olika yrken enligt SCB med hur ofta yrket står nära *hon* respektive *han* i svensk text: tidningar, sociala medier och vetenskaplig text från 2000 till 2015, 57 miljoner meningar.

| Yrke | Kvinnor enligt SCB | Andel *hon* i texten | Vår modell: hon / han (procent) |
|---|---|---|---|
| bibliotekarie | 76 % | 23 % | 8,8 / 15,0 |
| lärare | 77 % | 29 % | nästan jämnt |
| sjuksköterska (sköterska) | 91 % | 65 % | 13,8 / 2,7 |
| ingenjör | 24 % | 13 % | 4,6 / 27,8 |

Bibliotekarie nämns alltså oftare med *han* än med *hon* i svensk text, fast de flesta bibliotekarier är kvinnor. Det kan förklara vad vår modell gör. Men GPT-SW3 tränades på en annan textsamling (The Nordic Pile), så det är en ledtråd och inte ett bevis.

Författarna påpekar också att texten i stort lutar åt *han*: "the corpora are biased towards classifying sentences as male-associated in general, not just in the context of a profession."

**Starkare eller svagare i modellen än i texten:**
- Zhao m.fl. visar förstärkning: "the activity cooking is over 33% more likely to involve females than males in a training set, and a trained model further amplifies the disparity to 68% at test time." Det gäller bildmodeller, inte språkmodeller.
- Kirk m.fl. jämför GPT-2 med amerikansk arbetsmarknadsstatistik (inte med träningstexten): "For most occupations, GPT-2 reflects the skewed gender and ethnicity distribution found in US Labor Bureau data, and even pulls the societally-skewed distribution towards gender parity in cases where its predictions deviate".
- Sahlgren och Olsson fann mest skevhet i äldre ordvektorer och minst i modeller som tar hänsyn till sammanhanget (ELMo, BERT).

| Påstående på sidan | Bedömning |
|---|---|
| "Mönster som finns i texten följer med, också de skeva." | Gott stöd. |
| "mönstret kan vara både starkare och svagare i modellen än i texten" | Rimligt och delvis belagt. Förstärkning är visad för bildmodeller (Zhao) och utjämning för GPT-2 jämfört med arbetsmarknaden (Kirk). En direkt jämförelse mellan en språkmodell och dess egen träningstext har vi inte hittat. |

**Förslag:** Bibliotekarien bör vara ett av de färdiga exemplen, med en mening i rutan: "I svensk tidningstext nämns bibliotekarier oftare med *han* än med *hon*, fast de flesta bibliotekarier är kvinnor (Hansson m.fl. 2021). Modellen tränades på annan text, men mönstret liknar det."

GPT-SW3-artikeln tar inte upp skevhet för kön.
