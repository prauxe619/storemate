/**
 * COUNTR - DebugErrorBoundary
 * Put around the application root in DEBUG builds.
 */

import React from 'react';
import { View, Text, ScrollView } from 'react-native';
import GlobalDebug from './GlobalDebug';

export default class DebugErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      error: null,
    };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    GlobalDebug.error(
      'React.ErrorBoundary',
      error,
      { componentStack: info?.componentStack }
    );
  }

  render() {
    if (!this.state.error) {
      return this.props.children;
    }

    const error = this.state.error;

    return (
      <View
        style={{
          flex: 1,
          backgroundColor: '#111',
          padding: 20,
          paddingTop: 60,
        }}
      >
        <Text
          style={{
            color: '#ff5555',
            fontSize: 22,
            fontWeight: '800',
            marginBottom: 12,
          }}
        >
          COUNTR DEBUG BUILD
        </Text>

        <Text
          style={{
            color: '#fff',
            fontSize: 16,
            fontWeight: '700',
            marginBottom: 8,
          }}
        >
          JavaScript exception
        </Text>

        <ScrollView>
          <Text style={{ color: '#ddd', fontSize: 13 }}>
            {String(error?.message || error)}
            {'\n\n'}
            {String(error?.stack || '')}
          </Text>
        </ScrollView>
      </View>
    );
  }
}
