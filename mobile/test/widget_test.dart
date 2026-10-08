import 'package:flutter_test/flutter_test.dart';
import 'package:image_picker/image_picker.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:nook/main.dart';
import 'package:nook/services/nook_api.dart';

void main() {
  testWidgets('shows the NOOK sign-in experience', (tester) async {
    SharedPreferences.setMockInitialValues({});
    await tester.pumpWidget(const NookApp());
    await tester.pumpAndSettle();

    expect(find.text('Good to see you.'), findsOneWidget);
    expect(find.text('Sign in'), findsOneWidget);
    expect(find.text('New to NOOK? Create an account'), findsOneWidget);
  });

  test('maps supported picked media to backend MIME types', () {
    expect(nookMediaMimeType(XFile('/tmp/photo.jpg')), 'image/jpeg');
    expect(nookMediaMimeType(XFile('/tmp/clip.mov')), 'video/quicktime');
    expect(
      nookMediaMimeType(XFile('/tmp/animated', mimeType: 'image/avif')),
      'image/avif',
    );
    expect(nookMediaMimeType(XFile('/tmp/unsupported.heic')), isNull);
  });
}
