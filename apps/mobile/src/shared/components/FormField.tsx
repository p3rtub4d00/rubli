import type { ComponentProps } from 'react';
import { StyleSheet, Text, TextInput, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';

type NativeInputProps = ComponentProps<typeof TextInput>;

export type FormFieldProps = NativeInputProps & {
  label: string;
  optional?: boolean;
  helperText?: string;
  error?: string;
  containerStyle?: StyleProp<ViewStyle>;
  labelStyle?: StyleProp<TextStyle>;
};

/** Campo padronizado: a label nunca desaparece e o placeholder é apenas uma orientação. */
export function FormField({ label, optional = false, helperText, error, style, containerStyle, labelStyle, multiline, textAlignVertical, placeholderTextColor, ...inputProps }: FormFieldProps) {
  return <View style={[styles.field, containerStyle]}>
    <Text style={[styles.label, labelStyle]}>{label}{optional ? <Text style={styles.optional}> (opcional)</Text> : null}</Text>
    <TextInput
      {...inputProps}
      multiline={multiline}
      textAlignVertical={multiline ? (textAlignVertical ?? 'top') : textAlignVertical}
      placeholderTextColor={placeholderTextColor ?? '#6F7F94'}
      style={[styles.input, multiline && styles.multiline, error && styles.inputError, style]}
    />
    {error ? <Text style={styles.error}>{error}</Text> : helperText ? <Text style={styles.helper}>{helperText}</Text> : null}
  </View>;
}

const styles = StyleSheet.create({
  field: { marginBottom: 14 },
  label: { color: '#0B3B82', fontSize: 13, fontWeight: '800', marginBottom: 7 },
  optional: { color: '#65758A', fontWeight: '600' },
  input: { backgroundColor: '#FFFFFF', color: '#20334D', borderWidth: 1, borderColor: '#D8E4F4', borderRadius: 13, minHeight: 48, paddingHorizontal: 13, paddingVertical: 12, fontSize: 15, lineHeight: 20 },
  multiline: { minHeight: 112, paddingTop: 12 },
  inputError: { borderColor: '#C84B43' },
  helper: { color: '#65758A', fontSize: 12, lineHeight: 17, marginTop: 5 },
  error: { color: '#C84B43', fontSize: 12, fontWeight: '700', marginTop: 5 },
});
