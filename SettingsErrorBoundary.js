/**
 * Isoler les erreurs React du panneau Réglages : une régression de module
 * optionnel ne doit pas faire disparaître la visite en cours.
 * Ne capture pas les crashes natifs : ceux-ci nécessitent logcat/Play Vitals.
 */
import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { COLORS, FONTS } from './styles.js';

export class SettingsErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null, attempt: 0 };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidCatch(error, info) {
    console.error('[METRA][SETTINGS] Erreur React', error, info?.componentStack);
  }
  render() {
    if (!this.state.error) {
      return <React.Fragment key={this.state.attempt}>{this.props.children}</React.Fragment>;
    }
    return (
      <View style={{ flex: 1, padding: 22, justifyContent: 'center', backgroundColor: COLORS.bg }}>
        <Text style={{ fontSize: 18, fontFamily: FONTS.black, color: COLORS.ink }}>
          Réglages temporairement indisponibles
        </Text>
        <Text style={{ marginTop: 9, color: COLORS.inkSoft }}>
          Une erreur d'interface a été interceptée. Les visites et les photos locales n'ont pas été supprimées.
        </Text>
        <Text selectable style={{ marginTop: 12, padding: 12, backgroundColor: '#FFF4F2', borderRadius: 10, color: COLORS.red }}>
          {String(this.state.error?.message || this.state.error)}
        </Text>
        <TouchableOpacity onPress={() => this.setState(({ attempt }) => ({ error: null, attempt: attempt + 1 }))} style={{ marginTop: 16, padding: 14, borderRadius: 14, backgroundColor: COLORS.orange }}>
          <Text style={{ fontFamily: FONTS.bodyBold, color: COLORS.white, textAlign: 'center' }}>Réessayer</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={this.props.onBack} style={{ marginTop: 10, padding: 12 }}>
          <Text style={{ fontFamily: FONTS.bodyBold, color: COLORS.ink, textAlign: 'center' }}>Retour à l'accueil</Text>
        </TouchableOpacity>
      </View>
    );
  }
}
