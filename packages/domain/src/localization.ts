import type {
  DateFilterValue,
  EventCategory,
  PriceFilterValue,
  TrustLabel
} from './index.js';

export const SUPPORTED_LOCALES = ['fr', 'en'] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];
export const DEFAULT_LOCALE: SupportedLocale = 'fr';
export const LOCALE_STORAGE_KEY = 'pulso.locale';
export const LOCALE_COOKIE_NAME = 'pulso-locale';

export const SEARCH_MESSAGE_CODES = [
  'search.constraint.maximumPrice',
  'search.constraint.date',
  'search.constraint.category',
  'search.constraint.price',
  'search.constraint.excludeCategory',
  'search.constraint.status',
  'search.constraint.bounds',
  'search.ranking.soon',
  'search.ranking.lowerPrice',
  'search.ranking.higherTrust',
  'search.clarification.location',
  'search.clarification.date',
  'search.clarification.price',
  'search.message.routingUnsupported',
  'search.message.maximumPriceUnavailable',
  'search.message.unsupported',
  'search.message.clarificationRequired',
  'search.message.exactCount',
  'search.message.alternative',
  'search.message.noReliableResult',
  'search.reason.category',
  'search.reason.price',
  'search.reason.date',
  'search.reason.soon',
  'search.reason.lowerPriceFree',
  'search.reason.lowerPricePaid',
  'search.reason.lowerPriceUnknown',
  'search.reason.trust',
  'search.reason.eligible',
  'search.difference.price',
  'search.difference.category',
  'search.difference.excludedCategory'
] as const;

export type SearchMessageCode = (typeof SEARCH_MESSAGE_CODES)[number];
export interface SearchMessage {
  code: SearchMessageCode;
  params?: Record<string, string | number> | undefined;
}

const en = {
  'app.eyebrow': 'Pulso · Free exploration',
  'app.title': 'Explore Montréal',
  'app.logoHome': 'Pulso — Home',
  'app.description':
    'Explore and filter fictional events for the next seven Montréal calendar days. No account or intelligent search is required.',
  'language.label': 'Language',
  'language.fr': 'Français',
  'language.en': 'English',
  'map.label': 'Montréal event map',
  'map.zoomIn': 'Zoom in',
  'map.zoomOut': 'Zoom out',
  'map.recenter': 'Recenter on my location',
  'map.loading': 'Loading events…',
  'map.empty': 'No events match the active filters in this map area.',
  'map.error': 'Events could not be loaded. Your map context is preserved.',
  'map.basemapLoading': 'Loading map…',
  'map.basemapUnavailable': 'Map unavailable',
  'map.emptyTitle': 'No events found in this area',
  'map.emptySubtitle': 'Try widening your search or clearing your filters.',
  'map.emptyWiden': 'Recenter on Montréal',
  'map.emptyClear': 'Clear filters',
  'map.emptyThisWeek': 'See Montréal this week',
  'map.count.one': '1 matching fictional event in this map area.',
  'map.count.many': '{count} matching fictional events in this map area.',
  'map.previewAria': 'Preview {title}',
  'map.previewButton': 'Preview {title}',
  'common.retry': 'Retry',
  'filters.trigger': 'Filters ({count})',
  'filters.triggerAria': 'Filters, {count} active',
  'filters.activeAria': 'Active filters',
  'filters.default': 'Next 7 days · current map area',
  'filters.clearAria': 'Clear {label} filter',
  'filters.previewClosed':
    'The open event preview was closed because the filters changed.',
  'filters.title': 'Filters',
  'filters.close': 'Close filters',
  'filters.dateTime': 'Date and time',
  'filters.startDate': 'Start date',
  'filters.endDate': 'End date',
  'filters.selectedStartDate': 'Selected start date',
  'filters.selectedEndDate': 'Selected end date',
  'filters.categories': 'Categories',
  'filters.categoriesHelp': 'Multiple categories match with OR.',
  'filters.price': 'Price',
  'filters.priceHelp': 'Unknown prices appear only under All.',
  'filters.distance': 'Distance',
  'filters.ambiance': 'Mood',
  'filters.ambianceHelp': 'Coming soon: AI will determine each event’s mood.',
  'filters.geography': 'Geography',
  'filters.geographyHelp':
    'Current visible map area. Distance is not applied because no reference location was supplied; no routing or implicit location.',
  'filters.status': 'Status',
  'filters.statusHelp':
    'Upcoming and postponed events; cancelled events are excluded.',
  'filters.clearAll': 'Clear all filters',
  'date.next7': 'This week',
  'date.today': 'Today',
  'date.tonight': 'Tonight',
  'date.tomorrow': 'Tomorrow',
  'date.weekend': 'This weekend',
  'date.custom': 'Selected date or range',
  'category.music': 'Music / concerts',
  'category.nightlife': 'Nightlife / DJ / club / qualifying bar events',
  'category.festival': 'Festivals / festive events',
  'category.show': 'Shows',
  'category.comedy': 'Comedy',
  'category.other': 'Other qualifying scheduled events',
  'price.all': 'All',
  'price.free': 'Free',
  'price.paid': 'Paid',
  'price.unknown': 'Price unknown',
  'price.paidUnknown': 'Paid — price not confirmed',
  'price.from': 'From {amount}',
  'status.scheduled': 'Scheduled',
  'status.cancelled': 'Cancelled',
  'status.postponed': 'Postponed',
  'trust.confirmed': 'Confirmed',
  'trust.probable': 'Probable',
  'trust.to_verify': 'To verify',
  'trust.conflicting': 'Conflicting',
  'location.confirmed': 'Location confirmed',
  'location.uncertain': 'Location not confirmed',
  'event.descriptionUnknown': 'Description unknown',
  'event.organizerUnknown': 'Organizer unknown',
  'event.warning.cancelled': 'This event is cancelled.',
  'event.warning.postponed':
    'This event is postponed. Check the known schedule before leaving.',
  'event.warning.toVerify': 'Some event information is not confirmed.',
  'event.warning.conflicting': 'Sources disagree about this event.',
  'event.warning.location': 'The event location is uncertain.',
  'event.freshness.stale': 'Information may be stale. Last checked {date}.',
  'event.freshness.unknown':
    'Last checked {date}. No freshness claim is made without an approved policy.',
  'event.external.viewTickets': 'See tickets',
  'event.external.moreInfo': 'More information',
  'event.external.cancelled':
    'The external event or ticket-source action is unavailable because this event is cancelled.',
  'event.external.unavailable':
    'No external destination is currently available. Use the known access information above.',
  'search.panelAria': 'Optional intelligent search',
  'search.expand': 'Intelligent search',
  'search.collapse': 'Collapse search',
  'search.question': 'What do you want to do?',
  'search.placeholder': 'Search for an event, a venue, an artist…',
  'search.submit': 'Search',
  'search.help':
    'Optional deterministic matching. Manual filters always remain available; no external AI provider is used.',
  'search.processing': 'Interpreting request…',
  'search.error':
    'Search could not be completed. The map and manual filters remain available.',
  'search.understood': 'Pulso understood',
  'search.clearSearch': 'Clear search',
  'search.clarificationPrefix': 'One clarification: {message}',
  'search.hardConstraints': 'Hard constraints',
  'search.rankingSignals': 'Ranking signals',
  'search.results': 'Results on this map',
  'search.resultsAria': 'Search result map actions',
  'search.clearConstraint': 'Clear derived constraint {label}',
  'search.clear': 'Clear',
  'search.previewResultAria': 'Preview search result {index}: {matchType}',
  'search.previewResult': 'Preview {title} ({matchType})',
  'search.match.exact': 'exact',
  'search.match.alternative': 'alternative',
  'search.previewClosed':
    'The open event preview was closed because the search interpretation changed.',
  'search.whyExact': 'Why this matches',
  'search.whyAlternative': 'Why this is an alternative',
  'preview.close': 'Close preview',
  'preview.details': 'View event',
  'details.label': 'Event Details',
  'details.back': '← Back to map',
  'details.loading': 'Loading event details…',
  'details.error':
    'Event details could not be loaded. Your map context is preserved.',
  'details.retry': 'Retry details',
  'details.dateTime': 'Date and time',
  'details.venue': 'Venue',
  'details.address': 'Address',
  'details.price': 'Price',
  'details.description': 'Description',
  'details.organizer': 'Organizer',
  'details.access': 'Known access information',
  'details.source': 'Source',
  'details.trust': 'Trust',
  'details.verification': 'Verification',
  'details.externalSuffix': 'external destination',
  'details.externalHint':
    'Opens the identified external destination outside Pulso',
  'details.externalNote':
    'Pulso does not book, charge, store tickets, route, or create an itinerary.',
  'search.constraint.maximumPrice': 'Maximum price CAD {amount}',
  'search.constraint.date': '{date}',
  'search.constraint.category': '{category}',
  'search.constraint.price': '{price}',
  'search.constraint.excludeCategory': 'Exclude {category}',
  'search.constraint.status':
    'Upcoming scheduled or postponed events; cancelled events excluded',
  'search.constraint.bounds': 'Current visible Montréal map area',
  'search.ranking.soon': 'Prefer events starting sooner',
  'search.ranking.lowerPrice': 'Prefer lower-cost known options',
  'search.ranking.higherTrust': 'Prefer more strongly confirmed information',
  'search.clarification.location':
    'Which explicit location should Pulso use as the direct-distance reference? No location is assumed.',
  'search.clarification.date': 'Which one date range should Pulso use?',
  'search.clarification.price': 'Should the price filter be Free or Paid?',
  'search.message.routingUnsupported':
    'Pulso cannot interpret travel time because the MVP provides no routing or implicit location.',
  'search.message.maximumPriceUnavailable':
    'Pulso recognized the maximum price, but the current fictional data has no verified numeric prices, so it cannot claim a reliable match.',
  'search.message.unsupported':
    'Pulso could not reliably map this request to the supported event, date, price, or ranking criteria. Manual filters remain available.',
  'search.message.clarificationRequired':
    'One explicit answer is required before Pulso can apply this constraint.',
  'search.message.exactCount.one': '1 exact fictional match found.',
  'search.message.exactCount.many': '{count} exact fictional matches found.',
  'search.message.alternative':
    'No event satisfies every hard constraint. These alternatives differ only as stated.',
  'search.message.noReliableResult':
    'No reliable exact match or one-step explained alternative is available in this map area.',
  'search.reason.category': 'Category matches: {category}',
  'search.reason.price': 'Price matches: {price}',
  'search.reason.date': 'Date matches: {date}',
  'search.reason.soon':
    'Prioritized because it starts sooner among matching events',
  'search.reason.lowerPriceFree': 'Prioritized because the known price is Free',
  'search.reason.lowerPricePaid': 'Known as Paid; exact price is not confirmed',
  'search.reason.lowerPriceUnknown':
    'Price is unknown and was not treated as lower cost',
  'search.reason.trust': 'Trust information: {trust}',
  'search.reason.eligible':
    'Eligible in the current map area and active event window',
  'search.difference.price': 'Price differs from {price}.',
  'search.difference.category':
    'Event category differs from the requested category filter.',
  'search.difference.excludedCategory':
    'Event category was explicitly excluded in the request.',
  'favorites.showAll': 'Favorites',
  'favorites.showFavoritesOnly': 'My favorites',
  'favorites.add': 'Add to favorites',
  'favorites.remove': 'Remove from favorites',
  'details.share': 'Share',
  'details.shareText': 'Check out this event on Pulso: {title}',
  'details.linkCopied': 'Link copied to clipboard'
} as const;

export type MessageKey = keyof typeof en;

const fr = {
  'app.eyebrow': 'Pulso · Exploration libre',
  'app.title': 'Explorer Montréal',
  'app.logoHome': 'Pulso — Accueil',
  'app.description':
    'Explorez et filtrez les événements fictifs des sept prochains jours civils à Montréal. Aucun compte ni recherche intelligente n’est requis.',
  'language.label': 'Langue',
  'language.fr': 'Français',
  'language.en': 'English',
  'map.label': 'Carte des événements à Montréal',
  'map.zoomIn': 'Zoomer',
  'map.zoomOut': 'Dézoomer',
  'map.recenter': 'Recentrer sur ma position',
  'map.loading': 'Chargement des événements…',
  'map.empty':
    'Aucun événement ne correspond aux filtres actifs dans cette zone.',
  'map.error':
    'Les événements n’ont pas pu être chargés. Le contexte de la carte est conservé.',
  'map.basemapLoading': 'Chargement de la carte…',
  'map.basemapUnavailable': 'Carte indisponible',
  'map.emptyTitle': 'Aucun événement trouvé dans cette zone',
  'map.emptySubtitle': 'Essayez d’élargir votre recherche ou vos filtres.',
  'map.emptyWiden': 'Recentrer sur Montréal',
  'map.emptyClear': 'Effacer les filtres',
  'map.emptyThisWeek': 'Voir Montréal cette semaine',
  'map.count.one': '1 événement fictif correspondant dans cette zone.',
  'map.count.many':
    '{count} événements fictifs correspondants dans cette zone.',
  'map.previewAria': 'Aperçu de {title}',
  'map.previewButton': 'Aperçu de {title}',
  'common.retry': 'Réessayer',
  'filters.trigger': 'Filtres ({count})',
  'filters.triggerAria': 'Filtres, {count} actifs',
  'filters.activeAria': 'Filtres actifs',
  'filters.default': '7 prochains jours · zone visible',
  'filters.clearAria': 'Effacer le filtre {label}',
  'filters.previewClosed':
    'L’aperçu ouvert a été fermé parce que les filtres ont changé.',
  'filters.title': 'Filtres',
  'filters.close': 'Fermer les filtres',
  'filters.dateTime': 'Date et heure',
  'filters.startDate': 'Date de début',
  'filters.endDate': 'Date de fin',
  'filters.selectedStartDate': 'Date de début sélectionnée',
  'filters.selectedEndDate': 'Date de fin sélectionnée',
  'filters.categories': 'Catégories',
  'filters.categoriesHelp': 'Plusieurs catégories sont combinées avec OU.',
  'filters.price': 'Prix',
  'filters.priceHelp': 'Les prix inconnus apparaissent uniquement sous Tous.',
  'filters.distance': 'Distance',
  'filters.ambiance': 'Ambiance',
  'filters.ambianceHelp':
    'Bientôt : une IA déterminera l’ambiance de chaque événement.',
  'filters.geography': 'Zone géographique',
  'filters.geographyHelp':
    'Zone actuellement visible sur la carte. Aucune distance n’est appliquée sans lieu de référence fourni; aucun itinéraire ni emplacement implicite.',
  'filters.status': 'Statut',
  'filters.statusHelp':
    'Événements à venir et reportés; les événements annulés sont exclus.',
  'filters.clearAll': 'Effacer tous les filtres',
  'date.next7': 'Cette semaine',
  'date.today': "Aujourd'hui",
  'date.tonight': 'Ce soir',
  'date.tomorrow': 'Demain',
  'date.weekend': 'Ce week-end',
  'date.custom': 'Date ou période sélectionnée',
  'category.music': 'Musique / concerts',
  'category.nightlife':
    'Vie nocturne / DJ / club / événements admissibles dans un bar',
  'category.festival': 'Festivals / événements festifs',
  'category.show': 'Spectacles',
  'category.comedy': 'Humour',
  'category.other': 'Autres événements programmés admissibles',
  'price.all': 'Tous',
  'price.free': 'Gratuit',
  'price.paid': 'Payant',
  'price.unknown': 'Prix inconnu',
  'price.paidUnknown': 'Payant — prix non confirmé',
  'price.from': 'À partir de {amount}',
  'status.scheduled': 'Programmé',
  'status.cancelled': 'Annulé',
  'status.postponed': 'Reporté',
  'trust.confirmed': 'Confirmé',
  'trust.probable': 'Probable',
  'trust.to_verify': 'À vérifier',
  'trust.conflicting': 'Contesté',
  'location.confirmed': 'Lieu confirmé',
  'location.uncertain': 'Lieu non confirmé',
  'event.descriptionUnknown': 'Description inconnue',
  'event.organizerUnknown': 'Organisateur inconnu',
  'event.warning.cancelled': 'Cet événement est annulé.',
  'event.warning.postponed':
    'Cet événement est reporté. Vérifiez l’horaire connu avant de partir.',
  'event.warning.toVerify':
    'Certaines informations sur l’événement ne sont pas confirmées.',
  'event.warning.conflicting':
    'Les sources ne concordent pas au sujet de cet événement.',
  'event.warning.location': 'Le lieu de l’événement est incertain.',
  'event.freshness.stale':
    'Les informations peuvent être périmées. Dernière vérification le {date}.',
  'event.freshness.unknown':
    'Dernière vérification le {date}. Aucune affirmation de fraîcheur n’est faite sans politique approuvée.',
  'event.external.viewTickets': 'Voir les billets',
  'event.external.moreInfo': 'Plus d’informations',
  'event.external.cancelled':
    'L’action vers la source externe de l’événement ou la billetterie est indisponible parce que cet événement est annulé.',
  'event.external.unavailable':
    'Aucune destination externe n’est disponible actuellement. Utilisez les informations d’accès connues ci-dessus.',
  'search.panelAria': 'Recherche intelligente facultative',
  'search.expand': 'Recherche intelligente',
  'search.collapse': 'Réduire la recherche',
  'search.question': 'Que voulez-vous faire?',
  'search.placeholder': 'Rechercher un événement, un lieu, un artiste…',
  'search.submit': 'Rechercher',
  'search.help':
    'Correspondance déterministe facultative. Les filtres manuels restent toujours disponibles; aucun fournisseur d’IA externe n’est utilisé.',
  'search.processing': 'Interprétation de la demande…',
  'search.error':
    'La recherche n’a pas pu être effectuée. La carte et les filtres manuels restent disponibles.',
  'search.understood': 'Pulso a compris',
  'search.clearSearch': 'Effacer la recherche',
  'search.clarificationPrefix': 'Une précision : {message}',
  'search.hardConstraints': 'Contraintes strictes',
  'search.rankingSignals': 'Signaux de classement',
  'search.results': 'Résultats sur cette carte',
  'search.resultsAria': 'Actions des résultats de recherche sur la carte',
  'search.clearConstraint': 'Effacer la contrainte dérivée {label}',
  'search.clear': 'Effacer',
  'search.previewResultAria':
    'Aperçu du résultat de recherche {index} : {matchType}',
  'search.previewResult': 'Aperçu de {title} ({matchType})',
  'search.match.exact': 'exact',
  'search.match.alternative': 'alternative',
  'search.previewClosed':
    'L’aperçu ouvert a été fermé parce que l’interprétation de recherche a changé.',
  'search.whyExact': 'Pourquoi cet événement correspond',
  'search.whyAlternative': 'Pourquoi cet événement est une alternative',
  'preview.close': 'Fermer l’aperçu',
  'preview.details': 'Voir l’événement',
  'details.label': 'Détails de l’événement',
  'details.back': '← Retour à la carte',
  'details.loading': 'Chargement des détails…',
  'details.error':
    'Les détails n’ont pas pu être chargés. Le contexte de la carte est conservé.',
  'details.retry': 'Réessayer les détails',
  'details.dateTime': 'Date et heure',
  'details.venue': 'Lieu',
  'details.address': 'Adresse',
  'details.price': 'Prix',
  'details.description': 'Description',
  'details.organizer': 'Organisateur',
  'details.access': 'Informations d’accès connues',
  'details.source': 'Source',
  'details.trust': 'Confiance',
  'details.verification': 'Vérification',
  'details.externalSuffix': 'destination externe',
  'details.externalHint':
    'Ouvre la destination externe indiquée à l’extérieur de Pulso',
  'details.externalNote':
    'Pulso ne réserve pas, ne facture pas, ne stocke pas de billets, ne calcule pas d’itinéraire et ne crée pas de parcours.',
  'search.constraint.maximumPrice': 'Prix maximal de {amount} $ CA',
  'search.constraint.date': '{date}',
  'search.constraint.category': '{category}',
  'search.constraint.price': '{price}',
  'search.constraint.excludeCategory': 'Exclure {category}',
  'search.constraint.status':
    'Événements programmés ou reportés à venir; événements annulés exclus',
  'search.constraint.bounds':
    'Zone actuellement visible de la carte de Montréal',
  'search.ranking.soon': 'Privilégier les événements qui commencent plus tôt',
  'search.ranking.lowerPrice': 'Privilégier les options connues moins chères',
  'search.ranking.higherTrust':
    'Privilégier les informations confirmées avec plus de certitude',
  'search.clarification.location':
    'Quel lieu explicite Pulso doit-il utiliser comme référence de distance directe? Aucun emplacement n’est supposé.',
  'search.clarification.date': 'Quelle période Pulso doit-il utiliser?',
  'search.clarification.price':
    'Le filtre de prix doit-il être Gratuit ou Payant?',
  'search.message.routingUnsupported':
    'Pulso ne peut pas interpréter un temps de trajet, car le MVP ne fournit aucun itinéraire ni emplacement implicite.',
  'search.message.maximumPriceUnavailable':
    'Pulso a reconnu le prix maximal, mais les données fictives actuelles ne contiennent aucun prix numérique vérifié; aucune correspondance fiable ne peut donc être affirmée.',
  'search.message.unsupported':
    'Pulso n’a pas pu associer cette demande de manière fiable aux critères pris en charge pour les événements, les dates, les prix ou le classement. Les filtres manuels restent disponibles.',
  'search.message.clarificationRequired':
    'Une réponse explicite est requise avant que Pulso puisse appliquer cette contrainte.',
  'search.message.exactCount.one': '1 correspondance fictive exacte trouvée.',
  'search.message.exactCount.many':
    '{count} correspondances fictives exactes trouvées.',
  'search.message.alternative':
    'Aucun événement ne satisfait toutes les contraintes strictes. Ces alternatives diffèrent uniquement de la manière indiquée.',
  'search.message.noReliableResult':
    'Aucune correspondance exacte fiable ni alternative expliquée en une étape n’est disponible dans cette zone.',
  'search.reason.category': 'Catégorie correspondante : {category}',
  'search.reason.price': 'Prix correspondant : {price}',
  'search.reason.date': 'Date correspondante : {date}',
  'search.reason.soon':
    'Priorisé parce qu’il commence plus tôt parmi les événements correspondants',
  'search.reason.lowerPriceFree':
    'Priorisé parce que le prix connu est Gratuit',
  'search.reason.lowerPricePaid':
    'Indiqué comme Payant; prix exact non confirmé',
  'search.reason.lowerPriceUnknown':
    'Le prix est inconnu et n’a pas été considéré comme moins cher',
  'search.reason.trust': 'Informations de confiance : {trust}',
  'search.reason.eligible':
    'Admissible dans la zone visible et la période active des événements',
  'search.difference.price': 'Le prix diffère de {price}.',
  'search.difference.category':
    'La catégorie de l’événement diffère du filtre de catégorie demandé.',
  'search.difference.excludedCategory':
    'La catégorie de l’événement a été explicitement exclue dans la demande.',
  'favorites.showAll': 'Favoris',
  'favorites.showFavoritesOnly': 'Mes favoris',
  'favorites.add': 'Ajouter aux favoris',
  'favorites.remove': 'Retirer des favoris',
  'details.share': 'Partager',
  'details.shareText': 'Découvre cet événement sur Pulso : {title}',
  'details.linkCopied': 'Lien copié dans le presse-papier'
} satisfies Record<MessageKey, string>;

export const MESSAGE_CATALOGS = { en, fr } as const;

export function normalizeSupportedLocale(
  value: string | null | undefined
): SupportedLocale | undefined {
  const language = value?.trim().toLowerCase().split(/[-_]/, 1)[0];
  return language === 'fr' || language === 'en' ? language : undefined;
}

export function resolveSupportedLocale(
  preferences: readonly (string | null | undefined)[],
  stored?: string | null
): SupportedLocale {
  const storedLocale = normalizeSupportedLocale(stored);
  if (storedLocale) return storedLocale;
  for (const preference of preferences) {
    const locale = normalizeSupportedLocale(preference);
    if (locale) return locale;
  }
  return DEFAULT_LOCALE;
}

export function displayLocale(locale: SupportedLocale): 'fr-CA' | 'en-CA' {
  return locale === 'fr' ? 'fr-CA' : 'en-CA';
}

export function translate(
  locale: SupportedLocale,
  key: MessageKey,
  params: Record<string, string | number> = {}
): string {
  return MESSAGE_CATALOGS[locale][key].replace(
    /\{(\w+)\}/g,
    (_match, name: string) => String(params[name] ?? `{${name}}`)
  );
}

export function getDateFilterLabel(
  locale: SupportedLocale,
  date: DateFilterValue
): string {
  return translate(locale, `date.${date}` as MessageKey);
}

export function getCategoryLabel(
  locale: SupportedLocale,
  category: EventCategory
): string {
  return translate(locale, `category.${category}` as MessageKey);
}

export function getPriceLabel(
  locale: SupportedLocale,
  price: PriceFilterValue
): string {
  return translate(locale, `price.${price}` as MessageKey);
}

export function getTrustLabel(
  locale: SupportedLocale,
  trust: TrustLabel
): string {
  return translate(locale, `trust.${trust}` as MessageKey);
}

export function formatMontrealDateTime(
  value: string | Date,
  locale: SupportedLocale
): string {
  return new Intl.DateTimeFormat(displayLocale(locale), {
    timeZone: 'America/Toronto',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short'
  }).format(new Date(value));
}

export function formatMontrealDate(
  value: string | Date,
  locale: SupportedLocale
): string {
  return new Intl.DateTimeFormat(displayLocale(locale), {
    timeZone: 'America/Toronto',
    dateStyle: 'medium'
  }).format(new Date(value));
}

export function formatCad(amount: number, locale: SupportedLocale): string {
  return new Intl.NumberFormat(displayLocale(locale), {
    style: 'currency',
    currency: 'CAD'
  }).format(amount);
}

export function localizeSearchMessage(
  locale: SupportedLocale,
  message: SearchMessage
): string {
  const params = { ...message.params };
  const category = params.category as EventCategory | undefined;
  const date = params.date as DateFilterValue | undefined;
  const price = params.price as PriceFilterValue | undefined;
  const trust = params.trust as TrustLabel | undefined;
  if (category) params.category = getCategoryLabel(locale, category);
  if (date) params.date = getDateFilterLabel(locale, date);
  if (price) params.price = getPriceLabel(locale, price);
  if (trust) params.trust = getTrustLabel(locale, trust);
  if (message.code === 'search.message.exactCount') {
    const count = Number(params.count ?? 0);
    return translate(
      locale,
      count === 1
        ? 'search.message.exactCount.one'
        : 'search.message.exactCount.many',
      params
    );
  }
  return translate(locale, message.code as MessageKey, params);
}
