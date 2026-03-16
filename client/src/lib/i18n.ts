import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

const resources = {
  en: {
    translation: {
      // Status titles and descriptions
      'status.waiting.title': 'Order Registered',
      'status.waiting.description': "We're preparing your order. You'll be alerted when it's ready!",
      'status.subscribed.title': 'Order In Progress',
      'status.subscribed.description': "Your order is being prepared. You'll be alerted soon!",
      'status.scheduled.title': 'Order In Progress',
      'status.scheduled.description': "Your order is being prepared. You'll be alerted soon!",
      'status.notified.title': 'Order Ready!',
      'status.notified.description': 'Your order is ready for pickup',
      'status.completed.title': 'Order Ready!',
      'status.completed.description': 'Your order is ready for pickup',
      'status.unknown.title': 'Unknown Status',
      'status.unknown.description': 'Please contact staff for assistance',

      // Common UI strings
      'order.title': 'Digital Buzzer',
      'order.subtitle': "We'll notify you the moment your order is ready.",
      'order.header': 'Enable Notifications',
      'order.header_subtitle': 'Tap to activate sound and push alerts.',
      'order.enable_btn': 'Enable Notifications',
      'order.notFound': 'Order Not Found',
      'order.notFound_desc': 'This order does not exist or has expired.',

      // Status card
      'card.auto_update': 'This page updates automatically',
      'card.call_waiter': 'Call Waiter',
      'card.calling': 'Calling Waiter...',
      'card.waiter_help': 'Staff will come to your table',
      'card.ready_at': 'Ready at',
      'card.service_waiting': 'Request sent — waiting for staff',
      'card.service_acknowledged': 'Staff notified',

      // Message thread
      'chat.title': 'Chat with Staff',
      'chat.no_messages': 'No messages yet. Send a message to the staff below.',
      'chat.placeholder': 'Type a message...',
      'chat.send_btn': 'Send message',
      'chat.you': 'You',
      'chat.staff': 'Staff',

      // Status bar
      'status.push_on': 'Push On',
      'status.push_off': 'Push Off',
      'status.audio_ready': 'Audio Ready',
      'status.tap_enable': 'Tap to Enable',
      'status.mute': 'Mute sounds',
      'status.unmute': 'Unmute sounds',
      'status.muted': 'Muted',
      'status.sound_on': 'Sound On',

      // Toast messages
      'toast.offline_title': 'Offline',
      'toast.offline_service': 'Service request queued — will send when online',
      'toast.offline_message': 'Message queued — will send when online',

      // Offline banner
      'offline.banner': 'You are offline. Some features may be limited.',

      // Relative time
      'time.just_now': 'just now',
      'time.min_ago': '{{minutes}}m ago',
      'time.hour_ago': '{{hours}}h ago',
      'time.day_ago': '{{days}}d ago',

      // Guest assistant
      'ga.title': 'Ask Our AI Assistant',
      'ga.subtitle': 'Ask about our menu, ingredients, allergens, parking, events, and more.',
      'ga.placeholder': 'e.g. Does the pizza contain gluten?',
      'ga.input_label': 'Your question',
      'ga.send_label': 'Ask',
      'ga.sources': 'Sources',
      'ga.source_web': 'Web',
      'ga.source_kb': 'Info',
      'ga.history_label': 'Conversation history',
      'ga.disclaimer': 'AI responses may not be 100% accurate. Please confirm with staff for allergen-critical questions.',
      'ga.error_title': 'Request failed',
      'ga.error_desc': 'Could not get an answer. Please try again or ask a staff member.',
    }
  },
  de: {
    translation: {
      // Status titles and descriptions
      'status.waiting.title': 'Bestellung registriert',
      'status.waiting.description': 'Wir bereiten Ihre Bestellung vor. Sie werden benachrichtigt, wenn sie fertig ist!',
      'status.subscribed.title': 'Bestellung wird zubereitet',
      'status.subscribed.description': 'Ihre Bestellung wird zubereitet. Sie werden bald benachrichtigt!',
      'status.scheduled.title': 'Bestellung wird zubereitet',
      'status.scheduled.description': 'Ihre Bestellung wird zubereitet. Sie werden bald benachrichtigt!',
      'status.notified.title': 'Bestellung fertig!',
      'status.notified.description': 'Ihre Bestellung ist abholbereit',
      'status.completed.title': 'Bestellung fertig!',
      'status.completed.description': 'Ihre Bestellung ist abholbereit',
      'status.unknown.title': 'Unbekannter Status',
      'status.unknown.description': 'Bitte kontaktieren Sie das Personal für Hilfe',

      // Common UI strings
      'order.title': 'Digitales Piepsystem',
      'order.subtitle': 'Sie werden benachrichtigt, sobald Ihre Bestellung fertig ist.',
      'order.header': 'Benachrichtigungen aktivieren',
      'order.header_subtitle': 'Tippen Sie, um Sound- und Push-Benachrichtigungen zu aktivieren.',
      'order.enable_btn': 'Benachrichtigungen aktivieren',
      'order.notFound': 'Bestellung nicht gefunden',
      'order.notFound_desc': 'Diese Bestellung existiert nicht oder ist abgelaufen.',

      // Status card
      'card.auto_update': 'Diese Seite wird automatisch aktualisiert',
      'card.call_waiter': 'Kellner rufen',
      'card.calling': 'Rufe Kellner...',
      'card.waiter_help': 'Das Personal kommt zu Ihrem Tisch',
      'card.ready_at': 'Fertig um',
      'card.service_waiting': 'Anfrage gesendet — warte auf Personal',
      'card.service_acknowledged': 'Personal benachrichtigt',

      // Message thread
      'chat.title': 'Chat mit Personal',
      'chat.no_messages': 'Noch keine Nachrichten. Senden Sie eine Nachricht an das Personal.',
      'chat.placeholder': 'Geben Sie eine Nachricht ein...',
      'chat.send_btn': 'Nachricht senden',
      'chat.you': 'Sie',
      'chat.staff': 'Personal',

      // Status bar
      'status.push_on': 'Push an',
      'status.push_off': 'Push aus',
      'status.audio_ready': 'Audio bereit',
      'status.tap_enable': 'Zum Aktivieren tippen',
      'status.mute': 'Töne stummschalten',
      'status.unmute': 'Ton einschalten',
      'status.muted': 'Stummgeschaltet',
      'status.sound_on': 'Ton an',

      // Toast messages
      'toast.offline_title': 'Offline',
      'toast.offline_service': 'Serviceanfrage in die Warteschlange eingereiht — wird gesendet, wenn Sie online sind',
      'toast.offline_message': 'Nachricht in die Warteschlange eingereiht — wird gesendet, wenn Sie online sind',

      // Offline banner
      'offline.banner': 'Sie sind offline. Einige Funktionen sind möglicherweise eingeschränkt.',

      // Relative time
      'time.just_now': 'gerade eben',
      'time.min_ago': 'vor {{minutes}}m',
      'time.hour_ago': 'vor {{hours}}h',
      'time.day_ago': 'vor {{days}}T',

      // Guest assistant
      'ga.title': 'KI-Assistent fragen',
      'ga.subtitle': 'Fragen Sie zu unserem Menü, Zutaten, Allergenen, Parken, Veranstaltungen und mehr.',
      'ga.placeholder': 'z.B. Enthält die Pizza Gluten?',
      'ga.input_label': 'Ihre Frage',
      'ga.send_label': 'Fragen',
      'ga.sources': 'Quellen',
      'ga.source_web': 'Web',
      'ga.source_kb': 'Info',
      'ga.history_label': 'Gesprächsverlauf',
      'ga.disclaimer': 'KI-Antworten können nicht 100% genau sein. Bitte beim Personal nachfragen bei allergierelevanten Fragen.',
      'ga.error_title': 'Anfrage fehlgeschlagen',
      'ga.error_desc': 'Antwort konnte nicht abgerufen werden. Bitte erneut versuchen oder Personal fragen.',
    }
  }
};

i18n
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false
    },
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage']
    }
  });

export default i18n;
