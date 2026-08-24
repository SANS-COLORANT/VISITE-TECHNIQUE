import React from 'react';
import { BackHandler, Text, TouchableOpacity, View } from 'react-native';
import { styles } from './styles.js';

/**
 * Dernier filet de sécurité UI : évite un écran blanc si un composant React
 * lève une erreur inattendue. Les données SQLite déjà enregistrées restent intactes.
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
    if (__DEV__) console.error('Erreur UI non gérée', error, info?.componentStack);
  }

  reessayer = () => {
    this.setState((etat) => ({ error: null, generation: etat.generation + 1 }));
  };

  render() {
    if (!this.state.error) {
      return React.cloneElement(React.Children.only(this.props.children), { key: this.state.generation });
    }

    return (
      <View style={[styles.center, { padding: 28 }]}>
        <Text style={styles.errorTitle}>L’écran a rencontré un problème</Text>
        <Text style={[styles.errorText, { marginTop: 8, textAlign: 'center' }]}>Les données déjà enregistrées localement sont conservées. Tu peux relancer l’interface ou fermer l’application.</Text>
        {__DEV__ ? <Text style={[styles.errorText, { marginTop: 10 }]}>{String(this.state.error?.message || this.state.error)}</Text> : null}
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
