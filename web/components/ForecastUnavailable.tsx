import styles from "./ForecastUnavailable.module.css";

export default function ForecastUnavailable() {
  return (
    <p className={styles.message}>
      Forecast unavailable right now. Try again later.
    </p>
  );
}
