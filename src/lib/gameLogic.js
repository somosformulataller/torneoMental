import { CARD_DATA } from './cardThemes';

export function shuffleArray(array) {
  const newArray = [...array];
  for (let i = newArray.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
  }
  return newArray;
}

// Tablero de práctica con temática al azar — usado por el Server Component
// de /jugar para que Practicar abra con las cartas ya en el HTML.
export function generatePracticeBoard(count) {
  const themes = Object.keys(CARD_DATA);
  const theme = themes[Math.floor(Math.random() * themes.length)];
  return generateCardPairs(theme, count);
}

export function generateCardPairs(themeId, count) {
  // Ensure count is even and >= 4 (minimum for a playable memory board)
  const validCount = Math.max(4, count % 2 === 0 ? count : count + 1);
  const themeCards = CARD_DATA[themeId] || CARD_DATA['tecnologia'];

  // Never request more pairs than the theme has unique cards for
  const pairCount = Math.min(validCount / 2, themeCards.length);

  // Select random cards from theme
  const selectedCards = shuffleArray(themeCards).slice(0, pairCount);

  // Duplicate to create pairs
  const pairs = [];
  selectedCards.forEach((card, index) => {
    // We add a unique pairId to match them later
    const cardInstance1 = { ...card, theme: themeId, pairId: card.id, uniqueId: `${card.id}-1` };
    const cardInstance2 = { ...card, theme: themeId, pairId: card.id, uniqueId: `${card.id}-2` };
    pairs.push(cardInstance1, cardInstance2);
  });

  return shuffleArray(pairs);
}
