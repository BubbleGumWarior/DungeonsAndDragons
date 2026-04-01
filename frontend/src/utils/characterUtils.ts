// Helper function to paginate backstory text intelligently
export const paginateBackstory = (text: string, wordsPerPage: number = 500): string[] => {
  if (!text || text.trim().length === 0) return [];
  
  // Split by paragraphs (double newlines or single newlines)
  const paragraphs = text.split(/\n\s*\n|\n/).filter(p => p.trim().length > 0);
  const pages: string[] = [];
  let currentPage: string[] = [];
  let wordCount = 0;
  
  for (let i = 0; i < paragraphs.length; i++) {
    const paragraph = paragraphs[i].trim();
    const paragraphWords = paragraph.split(/\s+/).length;
    
    // If this single paragraph is longer than the word limit, it gets its own page
    if (paragraphWords > wordsPerPage) {
      // Save current page if it has content
      if (currentPage.length > 0) {
        pages.push(currentPage.join('\n\n'));
        currentPage = [];
      }
      // Put the long paragraph on its own page
      pages.push(paragraph);
      wordCount = 0;
    }
    // If adding this paragraph would exceed the word limit
    else if (wordCount + paragraphWords > wordsPerPage && currentPage.length > 0) {
      // Save current page and start a new one
      pages.push(currentPage.join('\n\n'));
      currentPage = [paragraph];
      wordCount = paragraphWords;
    } else {
      // Add paragraph to current page
      currentPage.push(paragraph);
      wordCount += paragraphWords;
    }
  }
  
  // Add any remaining paragraphs as the final page
  if (currentPage.length > 0) {
    pages.push(currentPage.join('\n\n'));
  }
  
  return pages;
};

// Calculate character health totals using limb ratio formula
// Top-arms percentage and lower-arm percentage support 4-armed races (Secondary Arms trait)
export const calculateCharacterHealth = (character: any, trackedHp?: { current: number; max: number }): { current: number; max: number; percentage: number } => {
  const baseHitPoints = typeof character.hit_points === 'number' ? character.hit_points : parseInt(character.hit_points) || 0;
  if (baseHitPoints <= 0) return { current: 0, max: 0, percentage: 0 };

  const con = character.abilities?.con ?? 10;
  const conMod = Math.floor((con - 10) / 2);
  const conBonus = Math.max(0, conMod * 0.1);

  const hasFourArms = character.race === 'Thri-kreen';

  const headMax    = Math.floor(baseHitPoints * Math.min(1.0, 0.25 + conBonus));
  const torsoMax   = Math.floor(baseHitPoints * Math.min(2.0, 1.0  + conBonus));
  const armMax     = Math.floor(baseHitPoints * Math.min(1.0, 0.15 + conBonus)); // per arm
  const lowerArmMax = hasFourArms ? Math.floor(baseHitPoints * 0.05) : 0; // per lower arm
  const legMax     = Math.floor(baseHitPoints * Math.min(1.0, 0.40 + conBonus));

  const maxHealth = headMax + torsoMax + armMax * 2 + lowerArmMax * 2 + legMax * 2;

  let currentHealth: number;
  if (trackedHp && trackedHp.max > 0) {
    // Scale tracked raw HP proportionally to limb total
    currentHealth = Math.round((trackedHp.current / trackedHp.max) * maxHealth);
  } else {
    currentHealth = maxHealth;
  }

  const percentage = maxHealth > 0 ? Math.min(100, (currentHealth / maxHealth) * 100) : 0;

  return { current: currentHealth, max: maxHealth, percentage };
};
