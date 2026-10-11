"use client";

import styles from "./page.module.css";

export default function ProfileError({ reset }: { reset: () => void }) {
  return (
    <main className={styles.page}>
      <h1 className={styles.title}>Couldn’t load this title</h1>
      <p className={styles.altTitles}>The data source didn’t respond. Try again in a moment.</p>
      <p className={styles.source}>
        <button type="button" onClick={reset} className={styles.retry}>
          Try again
        </button>
      </p>
    </main>
  );
}
