import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:nook/main.dart';

void main() {



  testWidgets('shows the NOOK sign-in experience', (tester) async {
    SharedPreferences.setMockInitialValues({});
    await tester.pumpWidget(const NookApp());
    await tester.pumpAndSettle();

    expect(find.text('Good to see you.'), findsOneWidget);
    expect(find.text('Sign in'), findsOneWidget);
    expect(find.text('New to NOOK? Create an account'), findsOneWidget);
  });
}
