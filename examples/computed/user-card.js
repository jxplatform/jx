/**
 * user-card.js — handlers for user-card.json
 *
 * Demonstrates handler interaction with multiple signals.
 * Computed signals ($fullName, $displayTitle, $scoreLabel) update automatically
 * via JSONata whenever their declared $deps change — no handler code needed for them.
 */

const NAMES = [
  { first: 'Jane',    last: 'Smith'   },
  { first: 'Bob',     last: 'Johnson' },
  { first: 'Alice',   last: 'Wilson'  },
  { first: 'Priya',   last: 'Patel'   },
  { first: 'Marcus',  last: 'Chen'    },
  { first: 'John',    last: 'Doe'     },
];

export default {

  /**
   * Increase score by 10, cap at 100. Level up when score passes multiples of 20.
   */
  addScore() {
    const next = Math.min(100, this.$score.get() + 10);
    this.$score.set(next);
    if (next >= this.$level.get() * 20) {
      this.$level.set(this.$level.get() + 1);
    }
  },

  /**
   * Decrease score by 10, floor at 0.
   */
  subtractScore() {
    this.$score.set(Math.max(0, this.$score.get() - 10));
  },

  /**
   * Pick a random name from the NAMES list and update both signal parts.
   */
  changeName() {
    const candidate = NAMES[Math.floor(Math.random() * NAMES.length)];
    this.$firstName.set(candidate.first);
    this.$lastName.set(candidate.last);
  },

};
