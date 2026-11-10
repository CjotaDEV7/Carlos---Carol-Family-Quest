# Carlos & Carol Family Quest 🐾

Um quebra-cabeça de lógica tranquilo: cada **região colorida** esconde um personagem. Os personagens são **Carol, Sol, Mezzo, Jade, Celso R., Rose, Cjota, Mamãe e Sandro**.

O jogo roda inteiro no navegador, sem servidor e sem login. Depois do primeiro carregamento, imagens, código e músicas ficam guardados em cache.

---

## Como executar

- **Duplo clique** em `index.html` abre o jogo direto. Nesse modo não há cache.
- **Servidor local**, recomendado para testar como no GitHub Pages:
  ```bash
  npx serve .
  ```

## Como jogar

O tabuleiro N×N tem N regiões coloridas. A regra:

- Cada **linha**, cada **coluna** e cada **região** tem exatamente **um** personagem.
- Dois personagens **nunca se encostam**, nem na diagonal.

| Ação | O que acontece |
|---|---|
| Toque **1×** numa casa | Marca ✕ ("aqui não"). Marcas nunca custam nada. |
| Toque **2×** | Tenta revelar. **Certo:** o personagem da região aparece, sorri e fica na casa. **Errado:** perde 1 das **3 vidas** e a casa vira ✕. |
| **Arrastar** o dedo | Marca (ou apaga) várias ✕ de uma vez. |
| **Desfazer** | Volta a última marca ou o último arraste. |
| **Dica** | Revela um personagem certo. São 3; **a 3ª encerra a partida**, e o jogo pede confirmação antes. |

- **Marcação automática:** casas descartadas por um personagem já revelado ganham um pontinho suave. Tentar revelar numa delas não custa vida.
- **Teclado:** setas movem, `X`/Espaço marca, `Enter` revela, `Z` desfaz, `Esc` pausa.
- **Sorteio:** a cada partida, os personagens são sorteados entre as regiões. No 9×9 aparecem os 9, sem repetição.
- **Personagens já revelados:** só nas fases 1 a 3 alguns aparecem desde o início, para ajudar. Da fase 4 em diante, todos começam escondidos.
- **Transição de fase:** cada fase começa com um quadro em branco. As casas se encaixam em onda diagonal, com um "toc" suave que sobe de tom, e um acorde leve no fim. O cronômetro só começa quando o tabuleiro fica pronto. Com "Reduzir movimento" ligado, as casas só aparecem esmaecendo; com as animações desligadas, o tabuleiro aparece na hora.
- **Coleção:** a tela **Personagens** mostra quem você já encontrou.

### Fases

| Níveis | Tabuleiro | Característica |
|---|---|---|
| 1–5 Introdução | 5×5 | Tutorial; personagens já revelados nas fases 1–3 |
| 6–15 Intermediário | 6×6 e 7×7 | Exige notar regiões confinadas a uma linha ou coluna |
| 16–20 Avançado | 8×8 | Técnicas de eliminação mais longas |
| 21–25 Especial | 9×9 | *Às Cegas* (sem marcação automática), *Sem Rascunho* (sem ✕), *Luz Apagada* (sem destaque de linha e coluna), *Para Sempre* |

**Garantias do gerador:** cada tabuleiro tem **solução única**, verificada por busca exaustiva. Também pode ser resolvido **só por dedução, sem chute**. A dificuldade vem da técnica lógica exigida e do tamanho.

**Pontuação:**

| Ação | Pontos |
|---|---|
| Personagem revelado | +100 |
| Concluir a fase | +500 |
| Sem erros | +300 |
| Sem dicas | +300 |
| Velocidade | até +200 |

O total acumulado soma só o **melhor resultado de cada fase**.

---

## Tela inicial

A arte "Carlos & Carol Family Quest" fica em `src/assets/ui/menu-hero.webp` (1024×844). Ela foi recortada da imagem original logo acima da segunda fileira de botões. O fundo foi uniformizado no creme `#F5EFDF`, e a engrenagem e os botões desenhados foram trocados por botões de verdade:

- **JOGAR** fica exatamente sobre o botão desenhado na arte.
- **Placar, Músicas, Personagens e Configurações** ficam numa grade 2×2 centralizada, todos do mesmo tamanho.
- A **engrenagem** no canto abre as Configurações.
- O **crédito** aparece no rodapé.

Para trocar a arte, substitua o arquivo mantendo a proporção 1024×844 e o botão JOGAR na mesma posição. Se a posição mudar, ajuste `.btn-menu-play` em `src/css/menu.css`.

---

## Imagens dos personagens

Dois arquivos por personagem, já cortados, sem fundo e com enquadramento padronizado:

```
src/assets/characters/<id>/normal.webp   ← expressão normal
src/assets/characters/<id>/happy.webp    ← expressão de alegria
```

`<id>` é um destes: `carol`, `sol`, `mezzo`, `jade`, `celso`, `rose`, `cjota`, `mamae`, `dr-sandro`.

As imagens originais do Gemini vinham com as duas expressões no mesmo arquivo e o "xadrez de transparência" desenhado como pixels. Elas foram processadas fora do jogo:

1. Cada expressão foi recortada e o fundo removido com um modelo de segmentação (ISNet) local.
2. A névoa e as legendas foram limpas.
3. Cada imagem foi centralizada no quadro (figura inteira no meio, nos dois eixos), na mesma escala para as duas expressões de cada personagem, em WebP 512×512.


> **Trocou uma imagem?** Aumente `VERSION` em `sw.js` (por exemplo, `v3.0.0` → `v3.0.1`) para os navegadores baixarem a nova.

---

## Como tocar a trilha sonora

A trilha já está integrada: as 20 músicas estão em `src/assets/audio/music/` e tocam sozinhas, em listas que mudam conforme a tela. Para ouvir:

1. **Abra o jogo por um endereço `http://` ou `https://`.** No computador, rode `npx serve .` dentro da pasta do jogo e abra o endereço que aparecer. Também funciona pelo GitHub Pages. Abrir o `index.html` com duplo clique toca as músicas, mas sem guardá-las em cache.
2. **Toque ou clique em qualquer coisa** (por exemplo, em **Jogar**). Os navegadores só liberam som depois da primeira interação; a música do menu começa nesse toque.
3. **Pronto.** A lista do menu toca e, quando uma faixa termina, a próxima começa sozinha. Ao entrar numa fase, a música troca suavemente para a lista daquele grupo de níveis.

**Se não tocar:**

- Confira em **Configurações** se *Silenciar música* está desligado e se o volume da música não está no zero.
- No celular, desligue o modo silencioso. Alguns aparelhos bloqueiam som de páginas no silencioso.

**Para ouvir uma faixa específica:**

- Em **Músicas**, toque no ▶ ao lado do nome.
- Para fixar uma faixa em todo o jogo, escolha **Seleção de trilha → Sempre a mesma** e depois a **Trilha fixa**.
- **Repetir a faixa** ligado: a mesma música repete. Desligado: segue a lista.

## Músicas

As 20 faixas ficam em `src/assets/audio/music/`. Cada contexto tem uma lista, definida em `PLAYLISTS` dentro de `src/js/audio-manager.js`:

| Contexto | Faixas |
|---|---|
| Tela inicial e menus | Manhã de Sol · Aroma de Café · Balanço do Cafezinho |
| Partida, níveis 1–5 | Encontro no Quintal · Carrossel Colorido · Roda de Amigos |
| Partida, níveis 6–12 | Tarde de Domingo · Tardes de Sol · Afternoon Sun & Shadows · Seaside Breeze Bossa |
| Partida, níveis 13–20 | Caminho Interno · Reflexos de Luz · Mistério do Sol · Mistério do Sol II |
| Partida, níveis 21+ | Caminho Aberto · Tropicália Dreams · Batida de Verão |
| Vitória | Roda de Sol |
| Conclusão da campanha (nível 25) | Horizontes Calmos |
| Derrota | Domingo Tranquilo |

A distribuição foi feita **pelos títulos**, porque as faixas não foram ouvidas. Para trocar, basta editar `PLAYLISTS`.

- **Transições:** a troca entre faixas usa crossfade, então só uma música toca por vez. Quando a faixa acaba, segue a próxima da lista, ou repete se "Repetir a faixa" estiver ligado.
- **Volume e modo:** volume e silenciar ficam em Configurações e em Músicas. Também há o modo "Sempre a mesma".
- **Efeitos sonoros:** gerados pelo próprio navegador (seleção, acerto, erro, dica, miado, revelação, vitória, derrota, cliques).
- **Autoplay:** o áudio começa após o primeiro toque, por exigência dos navegadores.

## Cache e armazenamento

| O quê | Onde | Como |
|---|---|---|
| Código e imagens | Cache Storage (`cpd-shell-<versão>`) | Service Worker (`sw.js`). Imagens em *cache-first*; código servido do cache e atualizado em segundo plano. |
| Músicas | Cache Storage (`cpd-audio-v1`) | Guardada na 1ª reprodução e tocada a partir do cache. |
| Progresso, configurações, partida em andamento | LocalStorage | Dados pequenos. Nenhuma imagem ou música vai para o LocalStorage. |

- **Offline:** depois da primeira visita, o jogo abre sem internet.
- **Arquivos oficiais:** continuam sendo os do projeto. O cache é só uma camada de velocidade.
- **Versão nova:** mudar `VERSION` em `sw.js` apaga o cache de código e imagens antigo. As músicas são preservadas.
- **Migrações:** dados da v1 (perfis, imagens importadas) e o progresso da v2 (que era Sudoku de números) são removidos na primeira abertura; o progresso da v3 começa do zero.

## Publicar no GitHub Pages

1. Envie o conteúdo desta pasta para a raiz de um repositório.
2. Abra **Settings → Pages → Deploy from a branch**, escolha `main` e `/ (root)`.
3. O jogo fica em `https://SEU-USUARIO.github.io/NOME-DO-REPO/`.

Todos os caminhos são relativos, então o jogo funciona em subdiretório. O Service Worker exige HTTPS (o GitHub Pages já usa) ou localhost.

## Estrutura

```
family-quest/
├── index.html · sw.js · .nojekyll · README.md
└── src/
    ├── css/   main (tokens da paleta) · menu · board · animations · responsive
    ├── js/
    │   ├── regions-generator.js  gerador: solução, regiões, unicidade, resolvedor lógico
    │   ├── levels.js · scoring.js
    │   ├── game.js          sessão: marcas, revelação, vidas, dicas, desfazer
    │   ├── characters.js    elenco (9), caminhos das imagens, sorteio por região
    │   ├── progress.js      progresso, recordes, histórico, coleção
    │   ├── audio-manager.js · animation-manager.js · storage.js
    │   └── ui.js · board-ui.js · app.js   (interface)
    └── assets/
        ├── characters/<id>/normal.webp, happy.webp
        ├── audio/music/*.mp3
        ├── ui/menu-hero.webp   (arte da tela inicial)
        └── icons/favicon.svg
```

**Paleta pastel** (tokens em `src/css/main.css`):

| Uso | Cores |
|---|---|
| Regiões | blush `#F6CFCB` · céu `#C8DCF1` · manteiga `#F6EDB8` · lavanda `#DAD1F0` · menta `#D2E8C6` · damasco `#FBDDB5` · água `#C2E4DF` · orquídea `#EDCDE5` · areia `#E6DACB` |
| Fundo | porcelana `#FBF7F2` |
| Progresso e acertos | menta profunda `#A9CF99` |
| Contorno das regiões | `#B9AC9E` |
| Texto | `#4A443D` / `#81786E` |
| Erro | `#C2726B` |
