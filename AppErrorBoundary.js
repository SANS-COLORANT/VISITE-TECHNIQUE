import React from 'react';
import { BackHandler, Text, TouchableOpacity, View } from 'react-native';
import { styles } from './styles.js';

/**
 * Dernier filet de sécurité UI : évite un écran blanc si un composant React
 * lève une erreur inattendue. Les données SQLite déjà enregistrées restent intactes.
 *
 * Le message technique reste volontairement visible en build de production :
 * sur une tablette terrain sans console attachée, c'est indispensable pour
 * identifier immédiatement la vraie cause d'une régression d'écran.
 */
class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null, generation: 0 };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('Erreur UI non gérée', error, info?.componentStack);
  }

  reessayer = () => {
    this.setState((etat) => ({ error: null, generation: etat.generation + 1 }));
  };

  render() {
    if (!this.state.error) {
      return React.cloneElement(React.Children.only(this.props.children), { key: this.state.generation });
    }

    const detail = String(this.state.error?.message || this.state.error || 'Erreur UI inconnue');

    return (
      <View style={[styles.center, { padding: 28 }]}>
        <Text style={styles.errorTitle}>L’écran a rencontré un problème</Text>
        <Text style={[styles.errorText, { marginTop: 8, textAlign: 'center' }]}>Les données déjà enregistrées localement sont conservées. Tu peux relancer l’interface ou fermer l’application.</Text>
        <View style={{ marginTop: 12, width: '100%', maxWidth: 720, padding: 10, borderRadius: 10, backgroundColor: '#FFF4F2', borderWidth: 1, borderColor: '#F1B5AE' }}>
          <Text selectable style={[styles.errorText, { fontSize: 11, color: '#8A1C13' }]}>{detail}</Text>
        </View>
        <TouchableOpacity style={[styles.btnPrimary, { marginTop: 20, minWidth: 180 }]} onPress={this.reessayer}>
          <Text style={styles.btnPrimaryText}>Relancer l’interface</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.btnSecondary, { marginTop: 10, minWidth: 180 }]} onPress={() => BackHandler.exitApp()}>
          <Text style={styles.btnSecondaryText}>Fermer l’application</Text>
        </TouchableOpacity>
      </View>
    );
  }
}

export { AppErrorBoundary };
