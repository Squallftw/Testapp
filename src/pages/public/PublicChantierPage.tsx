import { useEffect, type CSSProperties } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { fetchPublicChantier, type PublicChantier } from '@/data/public-api';
import styles from './PublicChantierPage.module.css';

// WhatsApp glyph extracted to a single path string so the SVG element stays
// inline — no icon library, no extra round-trips.
const WHATSAPP_PATH =
  'M17.5 14.4l-2.3-.5-1.1 1.1c-1.5-.6-2.7-1.8-3.3-3.3l1.1-1.1-.5-2.3a.7.7 0 00-.7-.5H8.8c-.4 0-.7.3-.7.7 0 5 4 9 9 9 .4 0 .7-.3.7-.7v-1.8a.7.7 0 00-.5-.7zM12 2C6.5 2 2 6.5 2 12c0 1.8.5 3.5 1.3 5L2 22l5.1-1.3c1.4.8 3.1 1.3 4.9 1.3 5.5 0 10-4.5 10-10S17.5 2 12 2z';

const PAPER = '#f6efe1';

export default function PublicChantierPage() {
  const { slug = '' } = useParams<{ slug: string }>();

  const { data, isLoading, isError } = useQuery({
    queryKey: ['public-chantier', slug],
    queryFn: () => fetchPublicChantier(slug),
    // Public page is read-on-demand; refresh tolerance is loose.
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  // Paint the document body in parchment — prevents the default body color
  // showing through during mobile pull-to-refresh / macOS elastic bounce.
  useEffect(() => {
    const original = document.body.style.backgroundColor;
    document.body.style.backgroundColor = PAPER;
    return () => {
      document.body.style.backgroundColor = original;
    };
  }, []);

  // Tab title. NB: rich link previews on WhatsApp/Twitter need Open Graph
  // tags rendered server-side — the crawler doesn't run JS. Adding a
  // per-route prerender step is tracked in FOLLOW_UPS.md.
  useEffect(() => {
    if (!data) return;
    const previous = document.title;
    document.title = `${data.chantier.name} — Suivi · ${data.org.name}`;
    return () => {
      document.title = previous;
    };
  }, [data]);

  if (isLoading) return <LoadingScreen />;
  if (isError || !data) return <NotFoundScreen slug={slug} />;

  return (
    <div className={styles.page}>
      <div className={styles.grain} aria-hidden="true" />
      <div className={styles.content}>
        <Topbar data={data} />
        <Hero data={data} />
        <Intro data={data} />
        <Stats data={data} />
        <Photos data={data} />
        <Milestones data={data} />
        {data.payments.enabled && <Payments data={data} />}
        <Contact data={data} />
        <Credits data={data} />
      </div>
    </div>
  );
}

function LoadingScreen() {
  return (
    <div className={styles.page}>
      <div className={styles.grain} aria-hidden="true" />
      <div className={styles.loading} role="status" aria-label="Chargement">
        ·
      </div>
    </div>
  );
}

function NotFoundScreen({ slug }: { slug: string }) {
  return (
    <div className={styles.page}>
      <div className={styles.grain} aria-hidden="true" />
      <div className={styles.notFound}>
        <span className={styles.smallcaps}>404 · introuvable</span>
        <h1 className={styles.notFoundTitle}>
          Ce chantier n’est plus suivi <em>publiquement</em>.
        </h1>
        <p>
          Le lien <code>{slug}</code> a peut-être expiré, ou l’entrepreneur l’a retiré.
        </p>
        <a href="/">Retour à BatiTrack →</a>
      </div>
    </div>
  );
}

function Topbar({ data }: { data: PublicChantier }) {
  return (
    <header
      className={`${styles.topbar} ${styles.wrap} ${styles.reveal}`}
      style={{ animationDelay: '0.10s' }}
    >
      <a className={styles.brand} href="#top">
        <span className={styles.brandMark}>{data.org.initial}</span>
        <span>
          <span className={styles.brandName}>{data.org.name}</span>
          <span className={styles.brandTag}>
            Construction · {data.org.city}
          </span>
        </span>
      </a>
      <div className={styles.topbarMeta}>
        <span>chantier no {data.chantier.number}</span>
        <span>mis à jour {data.chantier.lastUpdated}</span>
      </div>
    </header>
  );
}

function Hero({ data }: { data: PublicChantier }) {
  const { name, nameEmphasis } = data.chantier;
  const split = nameEmphasis ? name.split(nameEmphasis) : null;

  return (
    <section
      className={`${styles.hero} ${styles.reveal}`}
      style={{ animationDelay: '0.25s' }}
      aria-label="Photo de couverture"
    >
      <div
        className={styles.heroPhoto}
        role="img"
        aria-label={`Vue du chantier ${name}`}
      />
      <div className={styles.heroPlate}>
        <span className={styles.heroType}>
          {data.chantier.type} · {data.chantier.location}
        </span>
        <h1 className={`${styles.display} ${styles.heroTitle}`}>
          {split ? (
            <>
              {split[0] ?? ''}
              <em>{nameEmphasis}</em>
              {split[1] ?? ''}
            </>
          ) : (
            name
          )}
        </h1>
        <p className={styles.heroSub}>
          No {data.chantier.number} — lancé le {data.chantier.startDateDisplay}
        </p>
      </div>
    </section>
  );
}

function Intro({ data }: { data: PublicChantier }) {
  if (!data.chantier.intro) return null;
  return (
    <section
      className={`${styles.intro} ${styles.wrap} ${styles.reveal}`}
      style={{ animationDelay: '0.40s' }}
    >
      <span className={styles.smallcaps}>À&nbsp;propos&nbsp;du&nbsp;chantier</span>
      <p className={styles.introBody}>{data.chantier.intro}</p>
    </section>
  );
}

function Stats({ data }: { data: PublicChantier }) {
  const barFill = Math.max(0, Math.min(100, data.stats.pctDone)) / 100;
  return (
    <section
      className={`${styles.stats} ${styles.wrap} ${styles.reveal}`}
      style={{ animationDelay: '0.55s' }}
      aria-label="Avancement"
    >
      <div>
        <span className={styles.smallcaps}>avancement</span>
        <div className={styles.statNum}>
          {data.stats.pctDone}
          <span className={styles.statPct}>%</span>
        </div>
        <div
          className={styles.statBar}
          aria-hidden="true"
          style={{ ['--bar-fill' as string]: barFill } as CSSProperties}
        />
        <div className={styles.statBarRule}>
          <span>0%</span>
          <span>100%</span>
        </div>
      </div>
      <div className={styles.statDate}>
        <span className={styles.smallcaps}>livraison prévue</span>
        <span className={styles.statDateDay}>{data.stats.deliveryDayDisplay}</span>
        <span className={`${styles.statDateYear} ${styles.mono}`}>
          {data.stats.deliveryYearDisplay}
        </span>
      </div>
    </section>
  );
}

function Photos({ data }: { data: PublicChantier }) {
  if (!data.photos.length) return null;
  return (
    <section
      className={`${styles.photos} ${styles.wrap} ${styles.reveal}`}
      style={{ animationDelay: '0.70s' }}
      aria-label="Galerie de photos"
    >
      <header className={styles.photosHead}>
        <h2 className={styles.photosTitle}>Galerie du chantier</h2>
        <span className={`${styles.photosCount} ${styles.mono}`}>
          {data.photos.length} photos · {summarizeAuthors(data.photos)}
        </span>
      </header>
      <div className={styles.masonry}>
        {data.photos.map((photo, i) => (
          <figure
            key={photo.id}
            className={styles.photo}
            style={{ animationDelay: `${0.05 + i * 0.05}s` }}
          >
            <div
              className={styles.photoImg}
              style={{
                background: photo.placeholderBg,
                aspectRatio: photo.aspect,
              }}
            >
              <span className={`${styles.photoNum} ${styles.mono}`}>
                {String(photo.num).padStart(2, '0')}
              </span>
            </div>
            <figcaption className={styles.photoMeta}>
              <span>
                {photo.featured ? <strong>{photo.caption}</strong> : photo.caption}
              </span>
              <span>
                {photo.date} · {photo.authorInitial}
              </span>
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}

function Milestones({ data }: { data: PublicChantier }) {
  if (!data.milestones.length) return null;
  return (
    <section className={`${styles.milestones} ${styles.wrap}`} aria-label="Étapes du chantier">
      <h2 className={styles.milestonesTitle}>Étapes du chantier</h2>
      <ol className={styles.timeline}>
        {data.milestones.map((step) => (
          <li key={step.id} className={styles.step} data-status={step.status}>
            <span className={styles.stepMark} aria-hidden="true" />
            <div>
              <span className={styles.stepLabel}>{step.label}</span>
              <span className={styles.stepSub}>{step.detail}</span>
            </div>
            <span className={styles.stepDate}>{step.dateLabel}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

function Payments({ data }: { data: PublicChantier }) {
  return (
    <section className={`${styles.payments} ${styles.wrap}`} aria-label="Paiements">
      <div>
        <h2 className={styles.paymentsTitle}>Paiements</h2>
        {data.payments.note && <p className={styles.paymentsNote}>{data.payments.note}</p>}
      </div>
      <ul className={styles.payList}>
        {data.payments.rows.map((row) => (
          <li
            key={row.id}
            className={styles.payRow}
            data-status={row.status === 'upcoming' ? 'upcoming' : undefined}
          >
            <div>
              <span className={styles.payLabel}>
                {row.label}
                {row.status === 'upcoming' && <span className={styles.pill}>à échoir</span>}
              </span>
              <span className={styles.paySub}>{row.subLabel}</span>
            </div>
            <span className={styles.payAmount}>
              {formatAmount(row.amount)}
              <span className={styles.payAmountUnit}>dh</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Contact({ data }: { data: PublicChantier }) {
  const phoneDigits = data.org.phone.replace(/[^0-9]/g, '');
  const message = encodeURIComponent(
    `Bonjour ${data.org.contactPersonName}, j'ai une question concernant le chantier ${data.chantier.name}.`
  );
  const whatsappUrl = `https://wa.me/${phoneDigits}?text=${message}`;

  return (
    <section className={styles.contact} id="contact" aria-label="Contact">
      <div className={`${styles.contactInner} ${styles.wrap}`}>
        <div>
          <h2 className={styles.contactTitle}>
            Une question, une <em>visite</em>&nbsp;?
          </h2>
          <p className={styles.contactSub}>
            {data.org.contactPersonName} — chef de projet pour {data.chantier.name}.
            Réponse sous 24&nbsp;h, du lundi au samedi.
          </p>
        </div>
        <div>
          <a
            className={styles.contactCta}
            href={whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d={WHATSAPP_PATH} />
            </svg>
            Écrire sur WhatsApp
          </a>
          <span className={styles.contactPhone}>{data.org.phoneDisplay}</span>
        </div>
      </div>
    </section>
  );
}

function Credits({ data }: { data: PublicChantier }) {
  const signupUrl = `/signup?utm=public&ref=${encodeURIComponent(data.slug)}`;
  return (
    <>
      <hr className={styles.rule} />
      <footer className={`${styles.credits} ${styles.wrap}`}>
        <span className={styles.creditsLine}>
          Suivi avec <a href="/">BatiTrack</a> · les chantiers, en clair.
        </span>
        <a className={styles.creditsCta} href={signupUrl}>
          Entrepreneur ? Créez vos chantiers en 2&nbsp;min →
        </a>
      </footer>
    </>
  );
}

function formatAmount(amount: number): string {
  // fr-FR groups with NBSP / narrow-NBSP; normalize to plain space for
  // consistent rendering across browsers + better tabular alignment.
  return amount
    .toLocaleString('fr-FR', { useGrouping: true })
    .replace(/[\u00A0\u202F]/g, ' ');
}

function summarizeAuthors(photos: PublicChantier['photos']): string {
  const counts = new Map<string, number>();
  for (const p of photos) {
    counts.set(p.authorInitial, (counts.get(p.authorInitial) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([initial, n]) => `${n} par ${initial}`)
    .join(', ');
}
