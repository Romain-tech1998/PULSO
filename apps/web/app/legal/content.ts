import type { SupportedLocale } from '@pulso/domain/localization';

/**
 * The four legal surfaces DEC-0026 §4 makes a condition of the first
 * invitation, in both MVP languages (DEC-0003).
 *
 * They live here rather than in the message catalogue because that catalogue
 * is UI copy - short strings a component reads by key - and four legal
 * documents would bury it. The shape is the same in both languages, so a
 * section that exists in French and not in English is a type error rather
 * than a page that quietly says less to half the readers.
 */

/**
 * Facts only the operator can supply. Every document reads them from here, so
 * there is exactly one place to fill in, and `legal-placeholders.test.ts`
 * counts what is left. They must be zero before the first invitation goes
 * out: a privacy policy that does not name its enterprise is not one, and
 * Google's consent screen links to this page.
 */
const TODO = (what: string) => `⚠ À COMPLÉTER — ${what}`;

export const OPERATOR = {
  // Registration with the Registraire des entreprises was under way when
  // these documents were written. Both stay marked until it completes: an
  // enterprise operating under a name other than its owner's own must be
  // registered, and Pulso is such a name, so the number is coming rather
  // than optional.
  legalName: TODO("dénomination de l'entreprise, immatriculation en cours"),
  neq: TODO("numéro d'entreprise du Québec (NEQ), immatriculation en cours"),
  address: '4821, avenue des Érables, Montréal (Québec)',
  email: 'rmeynaud@pulsonight.com',
  privacyOfficer: 'Romain Meynaud',
  hosting:
    'Vercel (site web), Railway (interface de programmation) et Neon (base de données), tous situés hors du Québec'
};

export const LEGAL_UPDATED = '2026-08-20';

export const LEGAL_DOCS = ['privacy', 'terms', 'tickets', 'notice'] as const;
export type LegalDocSlug = (typeof LEGAL_DOCS)[number];

export interface LegalSection {
  heading: string;
  body: string[];
  list?: string[];
}

export interface LegalDocument {
  title: string;
  summary: string;
  sections: LegalSection[];
}

type Catalog = Record<LegalDocSlug, LegalDocument>;

const fr: Catalog = {
  privacy: {
    title: 'Politique de confidentialité',
    summary:
      "Ce que Pulso recueille, pourquoi, à qui c'est transmis et comment vous reprenez la main. Rédigée selon la Loi 25 (Loi sur la protection des renseignements personnels dans le secteur privé, Québec).",
    sections: [
      {
        heading: 'Qui exploite Pulso',
        body: [
          `Pulso est exploité par ${OPERATOR.legalName}, entreprise individuelle immatriculée au Québec (NEQ ${OPERATOR.neq}), dont l'adresse d'affaires est ${OPERATOR.address}.`,
          `Toute question relative à cette politique peut être adressée à ${OPERATOR.email}.`
        ]
      },
      {
        heading: 'Responsable de la protection des renseignements personnels',
        body: [
          `La personne responsable de la protection des renseignements personnels est ${OPERATOR.privacyOfficer}, jointe à ${OPERATOR.email}.`,
          "C'est à elle que s'adressent les demandes d'accès, de rectification, de retrait de consentement et de portabilité décrites plus bas, ainsi que toute plainte."
        ]
      },
      {
        heading: 'Ce que Pulso recueille, et quand',
        body: [
          'Sans compte, Pulso ne recueille aucun renseignement qui vous identifie. La carte, les filtres, la recherche et les fiches d’événement fonctionnent sans que vous ayez à dire qui vous êtes. Votre langue et vos favoris sont conservés par votre navigateur, sur votre appareil, et ne sont pas transmis.',
          'Lorsque vous créez un compte, la connexion se fait par Google et Pulso reçoit de Google votre adresse courriel, votre nom affiché, votre photo de profil et un identifiant de compte. Pulso ne reçoit jamais votre mot de passe Google.',
          'Ensuite, Pulso conserve ce que vous y faites et publiez :'
        ],
        list: [
          'les événements que vous mettez en favoris et ceux auxquels vous dites participer, avec la visibilité que vous avez choisie pour chacun ;',
          'vos amis, vos groupes et vos appartenances ;',
          'vos publications de forum, vos messages, vos conversations et leurs pièces jointes ;',
          'les photos que vous téléversez, y compris votre photo de profil et vos photos personnelles ;',
          'vos commandes et vos billets lorsque vous achetez auprès d’un organisateur ;',
          'vos signalements de contenu.'
        ]
      },
      {
        heading: 'Ce que Pulso ne recueille pas',
        body: [
          "Pulso ne tient aucun journal de ce que vous lisez. Le nombre d'ouvertures d'une fiche d'événement est un simple compteur par événement et par jour : il n'enregistre ni identifiant de compte, ni adresse IP, ni session, ni ligne par ouverture. Personne, y compris nous, ne peut savoir qui a consulté quoi.",
          "Pulso ne vous profile pas et ne personnalise rien. L'ordre dans lequel les événements vous sont présentés est un décompte de participations, identique pour tout le monde. Aucune inférence, aucune recommandation, aucune publicité ciblée.",
          "Pulso ne vend, ne loue et n'échange aucun renseignement personnel.",
          'Pulso ne stocke aucune donnée de carte bancaire, sous aucune forme. Les paiements sont traités par Stripe, et les numéros de carte ne transitent jamais par les serveurs de Pulso.'
        ]
      },
      {
        heading: 'Votre position',
        body: [
          "Si vous autorisez votre navigateur à partager votre position, elle est utilisée dans votre appareil pour centrer la carte. Elle n'est ni transmise à Pulso, ni enregistrée.",
          "Les serveurs de Pulso reçoivent en revanche la zone visible de la carte — un rectangle — afin de renvoyer les événements qui s'y trouvent. C'est une région, pas la position de votre appareil, et elle n'est pas rattachée à votre compte.",
          'Vous pouvez retirer cette autorisation à tout moment dans les réglages de votre navigateur ; la carte continue de fonctionner, centrée sur Montréal.'
        ]
      },
      {
        heading: 'Pourquoi ces renseignements sont recueillis',
        body: [
          "Pour vous permettre d'ouvrir une session, de retrouver vos favoris d'un appareil à l'autre, de participer à des événements, d'échanger avec d'autres comptes, d'appartenir à des groupes, d'acheter des billets et de les présenter à l'entrée.",
          'Pour la sécurité du service : empêcher les abus, traiter les signalements et retirer les images qui contreviennent aux règles.',
          'Pour les obligations légales et comptables liées aux ventes de billets.'
        ]
      },
      {
        heading: 'À qui ils sont communiqués, et où',
        body: [
          "Pulso ne communique vos renseignements qu'aux fournisseurs nécessaires à son fonctionnement, pour ces seules finalités. Plusieurs sont situés hors du Québec, principalement aux États-Unis :"
        ],
        list: [
          'Google — authentification. Reçoit votre demande de connexion ; nous transmet courriel, nom, photo et identifiant.',
          "Stripe — paiement des billets. Reçoit les données de paiement directement de vous ; nous ne les voyons pas. L'organisateur est le marchand de dossier.",
          "OpenAI — modération des images. Toute image téléversée est analysée avant publication ; l'image est transmise à cette seule fin.",
          "OpenRouter — interprétation de la recherche en langage naturel, lorsqu'elle est activée. Reçoit le texte de la recherche, jamais rattaché à un compte ; aucune recherche brute n'est conservée par Pulso.",
          `Hébergement de l'application et de la base de données — ${OPERATOR.hosting}.`
        ]
      },
      {
        heading: 'Ce que les autres voient',
        body: [
          'Votre nom affiché et votre photo de profil sont visibles des comptes avec lesquels vous interagissez. Vos photos personnelles ne sont visibles que de vos amis.',
          "Votre participation à un événement suit la visibilité que vous choisissez pour cet événement : personne, vos amis, ou tout le monde — y compris un visiteur sans compte. Ce choix se fait événement par événement, la valeur par défaut est « personne », et rien n'est modifié rétroactivement.",
          "L'adresse exacte d'un événement à accès approuvé n'est révélée qu'aux personnes approuvées par l'organisateur."
        ]
      },
      {
        heading: 'Combien de temps ils sont conservés',
        body: [
          'Vos renseignements de compte et ce que vous avez publié sont conservés tant que votre compte existe.',
          "Les commandes et billets sont conservés le temps requis par les obligations comptables et fiscales applicables, même après la fermeture d'un compte.",
          'Les images refusées à la modération ne sont jamais publiées. Une image signalée est conservée le temps du traitement du signalement.',
          "À la fermeture de votre compte, vos renseignements sont détruits, à l'exception de ce que la loi impose de conserver. Vos messages déjà reçus restent visibles de leurs destinataires."
        ]
      },
      {
        heading: 'Vos droits',
        body: [
          "Vous pouvez, à tout moment et sans frais, demander l'accès aux renseignements que Pulso détient sur vous, leur rectification, le retrait de votre consentement, la portabilité de ceux que vous avez fournis, ou la cessation de leur diffusion.",
          `Écrivez à ${OPERATOR.email}. Une réponse vous est donnée dans les trente jours.`,
          "Si la réponse ne vous satisfait pas, vous pouvez porter plainte auprès de la Commission d'accès à l'information du Québec."
        ]
      },
      {
        heading: 'Témoins et stockage local',
        body: [
          "Pulso n'utilise aucun témoin publicitaire ni aucun outil de mesure d'audience tiers.",
          "Deux témoins seulement : votre choix de langue, et votre session lorsque vous êtes connecté. Vos favoris et vos préférences d'affichage sont conservés dans le stockage local de votre navigateur, sur votre appareil."
        ]
      },
      {
        heading: 'Incidents de confidentialité',
        body: [
          "En cas d'incident de confidentialité présentant un risque de préjudice sérieux, Pulso avise la Commission d'accès à l'information et les personnes concernées avec diligence, et tient le registre exigé par la loi."
        ]
      },
      {
        heading: 'Modifications',
        body: [
          "Cette politique peut être modifiée. La date de mise à jour figure en tête de page, et tout changement important vous est signalé dans l'application."
        ]
      }
    ]
  },
  terms: {
    title: "Conditions d'utilisation",
    summary:
      "Ce que Pulso fait, ce qu'il ne fait pas, et ce à quoi vous vous engagez en l'utilisant.",
    sections: [
      {
        heading: "Ce qu'est Pulso",
        body: [
          "Pulso est un répertoire d'événements géolocalisés à Montréal : une carte, des filtres, une recherche et des fiches d'événement. Il se consulte sans compte.",
          'Pour la plupart des événements, Pulso renvoie vers une billetterie ou une source externe. Pour les événements créés par un organisateur sur Pulso, la billetterie peut être native ; elle est régie par les conditions de billetterie.'
        ]
      },
      {
        heading: 'Bêta fermée',
        body: [
          "Pulso est actuellement en bêta fermée, sur invitation. Le service peut changer, être interrompu ou perdre des fonctionnalités sans préavis, et aucune garantie de disponibilité n'est offerte.",
          "Signaler ce qui ne fonctionne pas est la raison d'être de cette phase."
        ]
      },
      {
        heading: 'Votre compte',
        body: [
          "La création d'un compte se fait par Google. Vous êtes responsable de l'usage qui est fait de votre compte.",
          "Un compte est personnel. Vous devez avoir l'âge requis pour assister aux événements auxquels vous achetez un billet ; Pulso ne vérifie pas votre âge et ne le remplace pas au contrôle à l'entrée."
        ]
      },
      {
        heading: 'Ce que vous publiez',
        body: [
          "Vous restez titulaire de ce que vous publiez. Vous accordez à Pulso l'autorisation limitée de l'héberger et de l'afficher aux personnes à qui vous le destinez, aux seules fins de faire fonctionner le service.",
          'Vous garantissez avoir le droit de publier ce que vous publiez, y compris les photos.'
        ]
      },
      {
        heading: 'Conduite, signalement et modération',
        body: [
          "Sont interdits : le harcèlement, les propos haineux, les contenus sexuels impliquant des mineurs, les contenus illégaux, l'usurpation d'identité et le pourriel.",
          "Toute image téléversée est analysée automatiquement avant publication : elle est publiée, retenue en attente d'examen, ou refusée. Une image retenue n'est visible de personne. Remplacer une photo ne supprime jamais celle qu'elle remplace tant que la nouvelle n'est pas approuvée.",
          "Le texte n'est pas modéré automatiquement. Vous pouvez signaler un contenu depuis l'application ; un signalement est examiné par une personne, sans délai garanti."
        ]
      },
      {
        heading: 'Exactitude des événements',
        body: [
          "Une grande partie des événements provient de sources externes — billetteries, calendriers officiels, comptes publics d'organisateurs et de lieux. Pulso les affiche avec leur provenance et une indication de fraîcheur, mais ne peut garantir qu'une date, un prix ou une adresse est exact au moment où vous le lisez.",
          "Vérifiez toujours auprès de la source ou du lieu avant de vous déplacer. Si vous trouvez une erreur, signalez-la : elle est corrigée ou l'événement est retiré."
        ]
      },
      {
        heading: 'Événements créés par des organisateurs',
        body: [
          "Pulso n'organise aucun événement, n'en est ni le producteur ni le promoteur, et n'est partie à aucun contrat entre vous et un organisateur.",
          "L'organisateur est seul responsable de son événement : sa tenue, son contenu, son âge d'accès, sa sécurité, ses annulations et ses remboursements."
        ]
      },
      {
        heading: 'Retrait de contenu et fermeture',
        body: [
          "Pulso peut retirer un contenu qui contrevient à ces conditions ou à la loi, et suspendre l'accès d'un compte en cas d'abus manifeste ou répété.",
          "Vous pouvez cesser d'utiliser Pulso à tout moment et demander la suppression de votre compte."
        ]
      },
      {
        heading: 'Responsabilité',
        body: [
          "Pulso est fourni tel quel, sans garantie d'exactitude, de disponibilité ou d'adéquation à un usage particulier.",
          "Dans la mesure permise par la loi, la responsabilité de Pulso ne peut excéder les sommes que vous lui avez versées au cours des douze derniers mois. Rien ici n'écarte les droits que la Loi sur la protection du consommateur vous reconnaît."
        ]
      },
      {
        heading: 'Droit applicable',
        body: [
          'Ces conditions sont régies par le droit applicable au Québec, et les tribunaux du district de Montréal sont compétents.'
        ]
      }
    ]
  },
  tickets: {
    title: 'Conditions de billetterie et remboursement',
    summary:
      "À lire avant d'acheter : qui vous vend le billet, ce que vous payez, et qui doit le remboursement.",
    sections: [
      {
        heading: 'Qui vous vend le billet',
        body: [
          "C'est l'organisateur de l'événement, pas Pulso. L'organisateur est le marchand de dossier : c'est son nom qui figure sur le relevé de votre carte, c'est lui qui doit le remboursement, et c'est lui qui porte la contestation de paiement.",
          "Pulso fournit la plateforme et perçoit des frais de service. Pulso n'est pas partie au contrat entre vous et l'organisateur."
        ]
      },
      {
        heading: 'Ce que vous payez',
        body: [
          "Le prix affiché par l'organisateur, augmenté des frais de service de Pulso, soit 10 % du prix du billet. Ces frais s'ajoutent au prix ; ils ne sont pas prélevés sur la recette de l'organisateur.",
          "Le total exact vous est présenté avant tout paiement. Il n'y a pas d'autres frais."
        ]
      },
      {
        heading: 'Le paiement',
        body: [
          'Le paiement est traité par Stripe. Pulso ne voit ni ne conserve aucune donnée de carte.',
          "Une commande n'est confirmée que lorsque Stripe confirme le paiement. Les places sont retenues le temps du paiement, puis remises en vente si celui-ci n'aboutit pas."
        ]
      },
      {
        heading: 'Votre billet',
        body: [
          "Un billet est nominatif et rattaché à votre compte. Il porte un code QR signé, vérifié à l'entrée.",
          'Un billet ne peut être ni transféré, ni revendu, ni utilisé deux fois : un code déjà scanné est refusé.',
          "Le billet donne accès à l'événement dans les conditions fixées par l'organisateur, y compris l'âge minimum et le règlement du lieu."
        ]
      },
      {
        heading: "Annulation ou report par l'organisateur",
        body: [
          "Si l'événement est annulé, l'organisateur est tenu de vous rembourser. Le remboursement porte sur la totalité de ce que vous avez payé, frais de service de Pulso compris : Pulso restitue sa commission sur toute commande remboursée et ne conserve rien sur une vente défaite.",
          "En cas de report, l'organisateur vous indique si votre billet reste valable ou s'il est remboursé."
        ]
      },
      {
        heading: 'Demande de remboursement',
        body: [
          "Adressez votre demande à l'organisateur, dont les coordonnées figurent sur la fiche de l'événement. C'est lui qui décide et qui rembourse.",
          `Si vous n'obtenez pas de réponse, écrivez à ${OPERATOR.email} : Pulso peut relayer votre demande et vous indiquer l'état de votre commande, sans pouvoir rembourser à la place de l'organisateur.`,
          'Un remboursement est renvoyé sur le moyen de paiement utilisé.'
        ]
      },
      {
        heading: 'Ce que Pulso ne fait pas',
        body: [
          "Pulso ne rembourse pas de sa propre initiative, ne conserve pas les sommes de l'organisateur, ne fixe pas les prix, ne perçoit ni ne remet les taxes applicables à la vente du billet, et n'assure ni la tenue ni la sécurité de l'événement."
        ]
      },
      {
        heading: "Adresse d'un événement à accès approuvé",
        body: [
          "Certains événements ne révèlent leur adresse exacte qu'aux personnes approuvées par l'organisateur. Tant que votre demande n'est pas approuvée, la carte affiche un point volontairement décalé et l'adresse n'est pas communiquée. Une approbation retirée referme cet accès."
        ]
      },
      {
        heading: 'Taxes',
        body: [
          "Les taxes applicables à la vente du billet relèvent de l'organisateur, qui est le vendeur.",
          "Les frais de service de Pulso sont facturés par Pulso ; les taxes qui s'y appliquent, le cas échéant, sont indiquées au moment du paiement."
        ]
      }
    ]
  },
  notice: {
    title: 'Mentions légales',
    summary: "Qui édite ce site, qui l'héberge, et comment nous joindre.",
    sections: [
      {
        heading: 'Éditeur',
        body: [
          `${OPERATOR.legalName}, entreprise individuelle immatriculée au registre des entreprises du Québec sous le numéro ${OPERATOR.neq}.`,
          `Adresse : ${OPERATOR.address}`,
          `Courriel : ${OPERATOR.email}`
        ]
      },
      {
        heading: 'Responsable de la publication',
        body: [`${OPERATOR.privacyOfficer}`]
      },
      {
        heading: 'Hébergement',
        body: [`${OPERATOR.hosting}`]
      },
      {
        heading: 'Propriété intellectuelle',
        body: [
          "Le nom Pulso, son logo et l'identité visuelle du service appartiennent à son éditeur.",
          "Les affiches, photographies et descriptions d'événements appartiennent à leurs auteurs ou à leurs ayants droit et sont affichées avec l'indication de leur provenance. Toute demande de retrait peut être adressée à l'éditeur et est traitée sans délai injustifié."
        ]
      },
      {
        heading: 'Signaler un contenu',
        body: [
          `Un contenu peut être signalé depuis l'application, ou par courriel à ${OPERATOR.email}.`
        ]
      }
    ]
  }
};

const en: Catalog = {
  privacy: {
    title: 'Privacy policy',
    summary:
      'What Pulso collects, why, who it is shared with, and how you take it back. Written to meet Law 25 (Quebec private-sector privacy legislation).',
    sections: [
      {
        heading: 'Who operates Pulso',
        body: [
          `Pulso is operated by ${OPERATOR.legalName}, a sole proprietorship registered in Quebec (NEQ ${OPERATOR.neq}), with its business address at ${OPERATOR.address}.`,
          `Questions about this policy go to ${OPERATOR.email}.`
        ]
      },
      {
        heading: 'Person in charge of personal information',
        body: [
          `The person in charge of the protection of personal information is ${OPERATOR.privacyOfficer}, reachable at ${OPERATOR.email}.`,
          'Requests for access, correction, withdrawal of consent and portability described below go to that person, as do complaints.'
        ]
      },
      {
        heading: 'What Pulso collects, and when',
        body: [
          'With no account, Pulso collects nothing that identifies you. The map, the filters, the search and the event pages all work without you saying who you are. Your language and your favourites are kept by your browser, on your device, and are not transmitted.',
          'When you create an account, sign-in goes through Google, and Pulso receives your email address, display name, profile photo and an account identifier from Google. Pulso never receives your Google password.',
          'From then on, Pulso keeps what you do and publish:'
        ],
        list: [
          'the events you favourite and those you say you are attending, with the visibility you chose for each;',
          'your friends, your groups and your memberships;',
          'your forum posts, messages, conversations and their attachments;',
          'the photos you upload, including your profile photo and personal photos;',
          'your orders and tickets when you buy from an organizer;',
          'the content you report.'
        ]
      },
      {
        heading: 'What Pulso does not collect',
        body: [
          'Pulso keeps no record of what you read. The number of times an event page is opened is a plain counter, per event and per day: it stores no account identifier, no IP address, no session, and no row per opening. Nobody, ourselves included, can tell who looked at what.',
          'Pulso does not profile you and personalises nothing. The order events appear in is a count of attendances, identical for everyone. No inference, no recommendation, no targeted advertising.',
          'Pulso does not sell, rent or trade personal information.',
          'Pulso stores no card data, in any form. Payments are handled by Stripe, and card numbers never pass through Pulso servers.'
        ]
      },
      {
        heading: 'Your location',
        body: [
          'If you let your browser share your position, it is used on your device to centre the map. It is neither transmitted to Pulso nor recorded.',
          'Pulso servers do receive the visible area of the map — a rectangle — in order to return the events inside it. That is a region, not your device position, and it is not attached to your account.',
          'You can withdraw the permission at any time in your browser settings; the map keeps working, centred on Montréal.'
        ]
      },
      {
        heading: 'Why this information is collected',
        body: [
          'To let you sign in, find your favourites across devices, attend events, talk to other accounts, belong to groups, buy tickets and present them at the door.',
          'For the safety of the service: preventing abuse, handling reports, and removing images that break the rules.',
          'For the legal and accounting obligations attached to ticket sales.'
        ]
      },
      {
        heading: 'Who it is shared with, and where',
        body: [
          'Pulso shares your information only with the providers it needs to operate, and only for those purposes. Several are located outside Quebec, mainly in the United States:'
        ],
        list: [
          'Google — authentication. Receives your sign-in request; returns email, name, photo and identifier.',
          'Stripe — ticket payments. Receives payment details directly from you; we never see them. The organizer is the merchant of record.',
          'OpenAI — image moderation. Every uploaded image is screened before publication; the image is sent for that purpose only.',
          'OpenRouter — natural-language search interpretation, when enabled. Receives the search text, never attached to an account; Pulso stores no raw query.',
          `Application and database hosting — ${OPERATOR.hosting}.`
        ]
      },
      {
        heading: 'What other people see',
        body: [
          'Your display name and profile photo are visible to the accounts you interact with. Your personal photos are visible to your friends only.',
          'Your attendance follows the visibility you choose for that event: nobody, your friends, or everyone — including a reader with no account. The choice is made per event, the default is nobody, and nothing is changed retroactively.',
          'The exact address of an approval-only event is disclosed solely to people the organizer has approved.'
        ]
      },
      {
        heading: 'How long it is kept',
        body: [
          'Your account information and what you have published are kept for as long as your account exists.',
          'Orders and tickets are kept for as long as applicable accounting and tax obligations require, including after an account is closed.',
          'Images refused at moderation are never published. A flagged image is kept while the report is handled.',
          'When you close your account your information is destroyed, except what the law requires be kept. Messages already received remain visible to the people who received them.'
        ]
      },
      {
        heading: 'Your rights',
        body: [
          'At any time and free of charge, you may ask for access to the information Pulso holds about you, its correction, the withdrawal of your consent, the portability of what you provided, or that its dissemination cease.',
          `Write to ${OPERATOR.email}. You receive an answer within thirty days.`,
          'If that answer does not satisfy you, you may complain to the Commission d’accès à l’information du Québec.'
        ]
      },
      {
        heading: 'Cookies and local storage',
        body: [
          'Pulso uses no advertising cookie and no third-party analytics.',
          'Two cookies only: your language choice, and your session when signed in. Your favourites and display preferences are kept in your browser’s local storage, on your device.'
        ]
      },
      {
        heading: 'Confidentiality incidents',
        body: [
          'If a confidentiality incident presents a risk of serious injury, Pulso notifies the Commission d’accès à l’information and the people concerned promptly, and keeps the register the law requires.'
        ]
      },
      {
        heading: 'Changes',
        body: [
          'This policy may change. The update date is at the top of this page, and any significant change is signalled in the application.'
        ]
      }
    ]
  },
  terms: {
    title: 'Terms of use',
    summary:
      'What Pulso does, what it does not do, and what you agree to by using it.',
    sections: [
      {
        heading: 'What Pulso is',
        body: [
          'Pulso is a directory of geolocated events in Montréal: a map, filters, a search and event pages. It can be browsed with no account.',
          'For most events, Pulso links out to a ticketing service or an external source. For events an organizer creates on Pulso, ticketing may be native, and is governed by the ticket terms.'
        ]
      },
      {
        heading: 'Closed beta',
        body: [
          'Pulso is currently an invitation-only closed beta. The service may change, be interrupted or lose features without notice, and no availability is guaranteed.',
          'Reporting what does not work is the point of this phase.'
        ]
      },
      {
        heading: 'Your account',
        body: [
          'Accounts are created through Google. You are responsible for what is done with yours.',
          'An account is personal. You must meet the age requirement of any event you buy a ticket for; Pulso does not verify your age and does not replace the check at the door.'
        ]
      },
      {
        heading: 'What you publish',
        body: [
          'You keep ownership of what you publish. You grant Pulso the limited permission to host it and display it to the people you intend it for, solely to operate the service.',
          'You confirm you have the right to publish what you publish, photos included.'
        ]
      },
      {
        heading: 'Conduct, reporting and moderation',
        body: [
          'Not allowed: harassment, hateful speech, sexual content involving minors, unlawful content, impersonation and spam.',
          'Every uploaded image is screened automatically before publication: it is published, held for review, or refused. A held image is visible to nobody. Replacing a photo never destroys the one it replaces until the new one is approved.',
          'Text is not automatically moderated. You can report content from the application; a report is reviewed by a person, with no guaranteed delay.'
        ]
      },
      {
        heading: 'Event accuracy',
        body: [
          'Many events come from external sources — ticketing services, official calendars, and the public accounts of organizers and venues. Pulso shows them with their provenance and a freshness indication, but cannot guarantee that a date, a price or an address is correct at the moment you read it.',
          'Always check with the source or the venue before travelling. If you find an error, report it: it gets corrected, or the event is withdrawn.'
        ]
      },
      {
        heading: 'Organizer-created events',
        body: [
          'Pulso organises no event, is neither producer nor promoter, and is not a party to any contract between you and an organizer.',
          'The organizer alone is responsible for their event: that it happens, its content, its age policy, its safety, its cancellations and its refunds.'
        ]
      },
      {
        heading: 'Content removal and closure',
        body: [
          'Pulso may remove content that breaches these terms or the law, and suspend an account in case of obvious or repeated abuse.',
          'You may stop using Pulso at any time and ask for your account to be deleted.'
        ]
      },
      {
        heading: 'Liability',
        body: [
          'Pulso is provided as is, with no warranty of accuracy, availability or fitness for a particular purpose.',
          'To the extent the law permits, Pulso’s liability cannot exceed the amounts you paid it over the last twelve months. Nothing here removes the rights the Consumer Protection Act gives you.'
        ]
      },
      {
        heading: 'Governing law',
        body: [
          'These terms are governed by the law applicable in Quebec, and the courts of the district of Montréal have jurisdiction.'
        ]
      }
    ]
  },
  tickets: {
    title: 'Ticket terms and refunds',
    summary:
      'Read before buying: who sells you the ticket, what you pay, and who owes the refund.',
    sections: [
      {
        heading: 'Who sells you the ticket',
        body: [
          'The event organizer, not Pulso. The organizer is the merchant of record: their name appears on your card statement, they owe the refund, and they carry the chargeback.',
          'Pulso provides the platform and charges a service fee. Pulso is not a party to the contract between you and the organizer.'
        ]
      },
      {
        heading: 'What you pay',
        body: [
          'The price the organizer sets, plus Pulso’s service fee of 10% of the ticket price. The fee is added on top of the price; it is not taken out of the organizer’s revenue.',
          'The exact total is shown to you before any payment. There are no other fees.'
        ]
      },
      {
        heading: 'Payment',
        body: [
          'Payment is handled by Stripe. Pulso neither sees nor stores any card data.',
          'An order is confirmed only when Stripe confirms the payment. Seats are held while you pay, and go back on sale if the payment does not complete.'
        ]
      },
      {
        heading: 'Your ticket',
        body: [
          'A ticket is personal and attached to your account. It carries a signed QR code, verified at the door.',
          'A ticket cannot be transferred, resold, or used twice: a code already scanned is refused.',
          'The ticket grants entry on the conditions the organizer sets, including any minimum age and the venue’s own rules.'
        ]
      },
      {
        heading: 'Cancellation or postponement by the organizer',
        body: [
          'If the event is cancelled, the organizer owes you a refund. It covers everything you paid, Pulso’s service fee included: Pulso returns its commission on any refunded order and keeps nothing on an undone sale.',
          'If the event is postponed, the organizer tells you whether your ticket stays valid or is refunded.'
        ]
      },
      {
        heading: 'Asking for a refund',
        body: [
          'Address your request to the organizer, whose contact details are on the event page. They decide and they refund.',
          `If you get no answer, write to ${OPERATOR.email}: Pulso can pass your request on and tell you the state of your order, without being able to refund in the organizer’s place.`,
          'A refund goes back to the payment method used.'
        ]
      },
      {
        heading: 'What Pulso does not do',
        body: [
          'Pulso does not refund on its own initiative, does not hold the organizer’s money, does not set prices, neither collects nor remits the taxes applicable to the ticket sale, and does not run or secure the event.'
        ]
      },
      {
        heading: 'The address of an approval-only event',
        body: [
          'Some events disclose their exact address only to people the organizer has approved. Until your request is approved, the map shows a deliberately offset point and the address is not given out. Approval that is withdrawn closes that access again.'
        ]
      },
      {
        heading: 'Taxes',
        body: [
          'Taxes applicable to the ticket sale are the organizer’s responsibility, as the seller.',
          'Pulso’s service fee is billed by Pulso; any taxes applying to it are shown at payment.'
        ]
      }
    ]
  },
  notice: {
    title: 'Legal notice',
    summary: 'Who publishes this site, who hosts it, and how to reach us.',
    sections: [
      {
        heading: 'Publisher',
        body: [
          `${OPERATOR.legalName}, a sole proprietorship registered in the Quebec enterprise register under number ${OPERATOR.neq}.`,
          `Address: ${OPERATOR.address}`,
          `Email: ${OPERATOR.email}`
        ]
      },
      {
        heading: 'Responsible for publication',
        body: [`${OPERATOR.privacyOfficer}`]
      },
      {
        heading: 'Hosting',
        body: [`${OPERATOR.hosting}`]
      },
      {
        heading: 'Intellectual property',
        body: [
          'The Pulso name, its logo and the visual identity of the service belong to its publisher.',
          'Event posters, photographs and descriptions belong to their authors or rights holders and are displayed with their provenance. Takedown requests can be sent to the publisher and are handled without undue delay.'
        ]
      },
      {
        heading: 'Reporting content',
        body: [
          `Content can be reported from the application, or by email to ${OPERATOR.email}.`
        ]
      }
    ]
  }
};

export const LEGAL_CONTENT: Record<SupportedLocale, Catalog> = { fr, en };
