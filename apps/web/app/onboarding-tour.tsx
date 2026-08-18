'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

import { translate, type SupportedLocale } from '@pulso/domain/localization';

type TourIcon = 'welcome' | 'map' | 'search' | 'favorite';

const STEPS: Array<{
  titleKey:
    | 'onboarding.welcome.title'
    | 'onboarding.map.title'
    | 'onboarding.search.title'
    | 'onboarding.favorite.title';
  bodyKey:
    | 'onboarding.welcome.body'
    | 'onboarding.map.body'
    | 'onboarding.search.body'
    | 'onboarding.favorite.body';
  icon: TourIcon;
}> = [
  {
    titleKey: 'onboarding.welcome.title',
    bodyKey: 'onboarding.welcome.body',
    icon: 'welcome'
  },
  {
    titleKey: 'onboarding.map.title',
    bodyKey: 'onboarding.map.body',
    icon: 'map'
  },
  {
    titleKey: 'onboarding.search.title',
    bodyKey: 'onboarding.search.body',
    icon: 'search'
  },
  {
    titleKey: 'onboarding.favorite.title',
    bodyKey: 'onboarding.favorite.body',
    icon: 'favorite'
  }
];

function StrokeIcon({ children }: { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

function TourVisual({
  icon,
  locale
}: {
  icon: TourIcon;
  locale: SupportedLocale;
}) {
  if (icon === 'welcome') {
    return (
      <div className="onboarding-visual onboarding-welcome-visual">
        <img src="/brand/pulso-logo-horizontal-dark.svg" alt="Pulso" />
        <span className="onboarding-pulse onboarding-pulse-one" />
        <span className="onboarding-pulse onboarding-pulse-two" />
        <span className="onboarding-pulse onboarding-pulse-three" />
      </div>
    );
  }

  if (icon === 'map') {
    return (
      <div className="onboarding-visual onboarding-map-visual">
        <div className="onboarding-map-toggle" aria-hidden="true">
          <span className="active">{translate(locale, 'nav.events')}</span>
          <span>{translate(locale, 'nav.venues')}</span>
        </div>
        <span className="onboarding-map-line line-one" />
        <span className="onboarding-map-line line-two" />
        <span className="onboarding-map-line line-three" />
        <span className="onboarding-pin pin-one" />
        <span className="onboarding-pin pin-two" />
        <span className="onboarding-pin pin-three" />
      </div>
    );
  }

  if (icon === 'search') {
    return (
      <div className="onboarding-visual onboarding-search-visual">
        <div className="onboarding-demo-search">
          <StrokeIcon>
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-4-4" />
          </StrokeIcon>
          <span>{translate(locale, 'search.placeholder')}</span>
        </div>
        <div className="onboarding-demo-chips" aria-hidden="true">
          <span>{translate(locale, 'date.tonight')}</span>
          <span>{translate(locale, 'date.weekend')}</span>
          <span>{translate(locale, 'price.free')}</span>
        </div>
        <small>{translate(locale, 'onboarding.search.optional')}</small>
      </div>
    );
  }

  return (
    <div className="onboarding-visual onboarding-favorite-visual">
      <span className="onboarding-heart">
        <StrokeIcon>
          <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21.2l7.8-7.8 1-1a5.5 5.5 0 0 0 0-7.8z" />
        </StrokeIcon>
      </span>
      <div className="onboarding-benefits">
        <span>{translate(locale, 'onboarding.favorite.local')}</span>
        <span>{translate(locale, 'onboarding.favorite.account')}</span>
      </div>
    </div>
  );
}

export function OnboardingTour({
  locale,
  onComplete
}: {
  locale: SupportedLocale;
  onComplete: () => void;
}) {
  const [step, setStep] = useState(0);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const current = STEPS[step]!;
  const lastStep = step === STEPS.length - 1;

  useEffect(() => {
    headingRef.current?.focus();
  }, [step]);

  return (
    <div className="onboarding-backdrop">
      <section
        className="onboarding-tour"
        role="dialog"
        aria-modal="true"
        aria-labelledby="onboarding-title"
        aria-describedby="onboarding-description"
      >
        <div className="onboarding-topline">
          <div
            className="onboarding-progress"
            role="progressbar"
            aria-valuemin={1}
            aria-valuemax={STEPS.length}
            aria-valuenow={step + 1}
            aria-label={translate(locale, 'onboarding.progress')}
          >
            {STEPS.map((_, index) => (
              <span key={index} className={index === step ? 'active' : ''} />
            ))}
          </div>
          <button
            type="button"
            className="onboarding-skip"
            onClick={onComplete}
          >
            {translate(locale, 'onboarding.skip')}
          </button>
        </div>

        <TourVisual icon={current.icon} locale={locale} />

        <div className="onboarding-copy">
          <p className="onboarding-step-count">
            {translate(locale, 'onboarding.step')
              .replace('{current}', String(step + 1))
              .replace('{total}', String(STEPS.length))}
          </p>
          <h2 id="onboarding-title" ref={headingRef} tabIndex={-1}>
            {translate(locale, current.titleKey)}
          </h2>
          <p id="onboarding-description">
            {translate(locale, current.bodyKey)}
          </p>
        </div>

        <div className="onboarding-actions">
          {step > 0 && (
            <button
              type="button"
              className="onboarding-secondary"
              onClick={() => setStep((value) => Math.max(0, value - 1))}
            >
              {translate(locale, 'onboarding.back')}
            </button>
          )}
          <button
            type="button"
            className="onboarding-primary"
            onClick={() => {
              if (lastStep) onComplete();
              else setStep((value) => Math.min(STEPS.length - 1, value + 1));
            }}
          >
            {translate(
              locale,
              lastStep ? 'onboarding.explore' : 'onboarding.next'
            )}
          </button>
        </div>

        {lastStep && (
          <p className="onboarding-no-account">
            <StrokeIcon>
              <path d="M12 3l7 3v5c0 4.4-3 8.2-7 9.5C8 19.2 5 15.4 5 11V6z" />
              <path d="m9 12 2 2 4-4" />
            </StrokeIcon>
            {translate(locale, 'onboarding.noAccount')}
          </p>
        )}
      </section>
    </div>
  );
}
