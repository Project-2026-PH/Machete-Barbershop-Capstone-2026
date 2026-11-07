/**
 * Utility & Reusable Class for filtering curse and slang words in Tagalog and English.
 * Prevents inappropriate usernames and barber feedback.
 */

export const Tagalog_Cursed_Words: string[] = [
  'putangina',
  'tangina',
  'pukingina',
  'pukangina',
  'pukinangina',
  'gago',
  'gaga',
  'tanga',
  'tarantado',
  'inutil',
  'ulol',
  'bwisit',
  'bobo',
  'puke',
  'kiki',
  'pepe',
  'tite',
  'titi',
  'bayag',
  'kupal',
  'hudas',
  'punyeta',
  'leche',
  'peste',
  'yawa',
  'bilat',
  'burat',
  'kantot',
  'jakol',
  'iyot',
  'libog',
  'pokpok',
  'tubol',
  'ogag',
  'engot',
  'shunga',
  'syunga',
  'bo is bo',
  'ta is nga',
  'tang is na',
  '8080',
  '130130',
  'panget',
  'pangit',
  'pakarat',
  'inutil',
  'pakyu'
];

export const Tagalog_Slang: string[] = [
  'epal',
  'buwaya',
  'siraulo',
  'bano',
  'olats',
  'amaw',
  'utol',
  'syota',
  'jowa',
  'chicks',
  'tsismosa',
  'taragis',
  'pakshet',
  'pakshit',
  'ashtadi',
  'nugagaw',
  'kikay',
  'balbon',
  'dugyot',
  'bulok',
  'bolok',
  'bu is lok',
  'bo is lok'
];

export const English_Cursed_Words: string[] = [
  'fuck',
  'fucking',
  'fucker',
  'shit',
  'shitting',
  'shitty',
  'bitch',
  'asshole',
  'bastard',
  'cunt',
  'dick',
  'pussy',
  'cock',
  'motherfucker',
  'whore',
  'slut',
  'crap',
  'damn',
  'piss',
  'nigger',
  'ni is gga',
  'nigga',
  'faggot',
  'fag',
  'bollocks',
  'bugger',
  'arsehole'
];

export const English_Slang: string[] = [
  'noob',
  'boomer',
  'simp',
  'incel',
  'douchebag',
  'douche',
  'jackass',
  'dipshit',
  'dumbass',
  'prick',
  'twat',
  'wanker',
  'turd',
  'scum',
  'loser',
  'freak',
  'skank',
  'hoe',
  'thot',
  'retard',
  'tard'
];

// All combined default lists
export const ALL_PROFANITY_WORDS: string[] = Array.from(
  new Set([
    ...Tagalog_Cursed_Words,
    ...Tagalog_Slang,
    ...English_Cursed_Words,
    ...English_Slang
  ])
);

export interface ProfanityValidationResult {
  isValid: boolean;
  reason?: string;
  foundWord?: string;
  category?: 'Tagalog_Cursed_Words' | 'Tagalog_Slang' | 'English_Cursed_Words' | 'English_Slang' | 'Custom';
}

/**
 * Reusable Profanity & Slang Filter Class
 */
export class ProfanityFilter {
  private static instance: ProfanityFilter;

  public tagalogCursedWords: Set<string>;
  public tagalogSlang: Set<string>;
  public englishCursedWords: Set<string>;
  public englishSlang: Set<string>;
  public customWords: Set<string>;

  constructor(customWords: string[] = []) {
    this.tagalogCursedWords = new Set(Tagalog_Cursed_Words.map(w => w.toLowerCase()));
    this.tagalogSlang = new Set(Tagalog_Slang.map(w => w.toLowerCase()));
    this.englishCursedWords = new Set(English_Cursed_Words.map(w => w.toLowerCase()));
    this.englishSlang = new Set(English_Slang.map(w => w.toLowerCase()));
    this.customWords = new Set(customWords.map(w => w.toLowerCase()));
  }

  public static getInstance(): ProfanityFilter {
    if (!ProfanityFilter.instance) {
      ProfanityFilter.instance = new ProfanityFilter();
    }
    return ProfanityFilter.instance;
  }

  /**
   * Normalizes text by replacing leetspeak characters and removing extra symbols.
   */
  private normalizeText(text: string): string {
    if (!text) return '';
    return text
      .toLowerCase()
      .replace(/0/g, 'o')
      .replace(/1|!|\|/g, 'i')
      .replace(/3/g, 'e')
      .replace(/4|@/g, 'a')
      .replace(/5|\$/g, 's')
      .replace(/7|\+/g, 't')
      .replace(/8/g, 'b')
      .replace(/9/g, 'g');
  }

  /**
   * Checks if text contains any forbidden word across all categories.
   */
  public containsProfanity(text: string): boolean {
    return !this.checkText(text).isValid;
  }

  public hasProfanity(text: string): boolean {
    return this.containsProfanity(text);
  }

  /**
   * Checks text and returns detailed validation result.
   */
  public checkText(text: string): ProfanityValidationResult {
    if (!text || typeof text !== 'string') {
      return { isValid: true };
    }

    const normalized = this.normalizeText(text);

    // Extract word tokens (alphanumeric sequences)
    const tokens = normalized.match(/[a-z0-9]+/g) || [];

    // Also strip non-alphanumeric completely to catch masked words (e.g. p.u.t.a.n.g.i.n.a)
    const compressed = normalized.replace(/[^a-z0-9]/g, '');

    // Helper matcher with typographical / typo-tolerance checks
    const getEditDistance = (a: string, b: string): number => {
      const matrix: number[][] = [];
      for (let i = 0; i <= b.length; i++) matrix[i] = [i];
      for (let j = 0; j <= a.length; j++) matrix[0][j] = j;

      for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
          if (b.charAt(i - 1) === a.charAt(j - 1)) {
            matrix[i][j] = matrix[i - 1][j - 1];
          } else {
            matrix[i][j] = Math.min(
              matrix[i - 1][j - 1] + 1, // substitution
              matrix[i][j - 1] + 1,     // insertion
              matrix[i - 1][j] + 1      // deletion
            );
          }
        }
      }
      return matrix[b.length][a.length];
    };

    const collapseDuplicates = (str: string): string => {
      return str.replace(/(.)\1+/g, '$1');
    };

    const checkWord = (word: string): ProfanityValidationResult | null => {
      const collapsedWord = collapseDuplicates(word);

      for (const token of tokens) {
        // 1. Direct token match
        if (token === word) {
          return { isValid: false, foundWord: word };
        }

        const collapsedToken = collapseDuplicates(token);

        // 2. Collapsed repeated characters match (e.g. "putttangina" -> "putangina", "gagooo" -> "gago")
        if (collapsedToken === word || collapsedToken === collapsedWord) {
          return { isValid: false, foundWord: word };
        }

        // 3. Typographical edit distance check (typos, swapped/missing/extra letters)
        const wordLen = word.length;
        if (wordLen >= 4) {
          const maxAllowedDistance = wordLen >= 8 ? 2 : 1;

          // Check token vs target profane word
          if (Math.abs(token.length - wordLen) <= maxAllowedDistance) {
            if (getEditDistance(token, word) <= maxAllowedDistance) {
              return { isValid: false, foundWord: word };
            }
          }

          // Check collapsed token vs target profane word
          if (Math.abs(collapsedToken.length - wordLen) <= maxAllowedDistance) {
            if (getEditDistance(collapsedToken, word) <= maxAllowedDistance) {
              return { isValid: false, foundWord: word };
            }
          }
        }
      }

      // Substring match for compound / concatenated offensive words (if word length >= 4)
      if (word.length >= 4) {
        if (compressed.includes(word) || compressed.includes(collapsedWord)) {
          return { isValid: false, foundWord: word };
        }
      }
      return null;
    };


    // Category check order
    for (const word of this.tagalogCursedWords) {
      const match = checkWord(word);
      if (match) return { ...match, category: 'Tagalog_Cursed_Words', reason: 'Contains Tagalog curse word.' };
    }

    for (const word of this.tagalogSlang) {
      const match = checkWord(word);
      if (match) return { ...match, category: 'Tagalog_Slang', reason: 'Contains Tagalog slang word.' };
    }

    for (const word of this.englishCursedWords) {
      const match = checkWord(word);
      if (match) return { ...match, category: 'English_Cursed_Words', reason: 'Contains English curse word.' };
    }

    for (const word of this.englishSlang) {
      const match = checkWord(word);
      if (match) return { ...match, category: 'English_Slang', reason: 'Contains English slang word.' };
    }

    for (const word of this.customWords) {
      const match = checkWord(word);
      if (match) return { ...match, category: 'Custom', reason: 'Contains forbidden word.' };
    }

    return { isValid: true };
  }

  /**
   * Validates username field specifically.
   */
  public validateUsername(username: string): ProfanityValidationResult {
    const result = this.checkText(username);
    if (!result.isValid) {
      return {
        ...result,
        reason: `Username cannot contain inappropriate or slang words ("${result.foundWord}").`
      };
    }
    return result;
  }

  /**
   * Validates feedback / review comments specifically.
   */
  public validateFeedback(feedback: string): ProfanityValidationResult {
    const result = this.checkText(feedback);
    if (!result.isValid) {
      return {
        ...result,
        reason: `Feedback cannot contain curse or offensive slang words ("${result.foundWord}").`
      };
    }
    return result;
  }

  /**
   * Replaces profanity in text with asterisks.
   */
  public sanitize(text: string, replaceChar: string = '*'): string {
    if (!text || typeof text !== 'string') return text;

    let result = text;
    const allWords = [
      ...Array.from(this.tagalogCursedWords),
      ...Array.from(this.tagalogSlang),
      ...Array.from(this.englishCursedWords),
      ...Array.from(this.englishSlang),
      ...Array.from(this.customWords)
    ];

    for (const word of allWords) {
      const regex = new RegExp(`\\b${word}\\b`, 'gi');
      result = result.replace(regex, replaceChar.repeat(word.length));
    }

    return result;
  }

  public clean(text: string, replaceChar: string = '*'): string {
    return this.sanitize(text, replaceChar);
  }
}
