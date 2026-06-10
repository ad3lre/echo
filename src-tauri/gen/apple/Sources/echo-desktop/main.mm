#include "bindings/bindings.h"

// Swift native auth overlay entry points (@_cdecl in EchoNativeAuth.swift),
// compiled into this app target.
extern "C" void echo_ios_boot(const char *apiBase);
extern "C" void echo_ios_dismiss_overlay(void);
extern "C" void echo_ios_show_login(void);

// Registry exported by the Rust shell (linked dylib). We hand it the Swift
// function pointers so Rust can drive the overlay later (boot / dismiss /
// re-show login) without a link-time dependency on the Swift symbols. Passing
// the pointers here also keeps the Swift functions from being dead-stripped.
extern "C" void echo_ios_register_overlay_callbacks(
    void (*boot)(const char *),
    void (*dismiss)(void),
    void (*show_login)(void));

// Sign in with Apple + APNs registration (EchoNativeIosFeatures.swift).
extern "C" bool echo_ios_sign_in_with_apple_sync(char **out_json, char **out_error);
extern "C" bool echo_ios_register_push_sync(char **out_token, char **out_error);
extern "C" void echo_ios_register_feature_callbacks(
    bool (*apple_sign_in)(char **, char **),
    bool (*register_push)(char **, char **));

int main(int argc, char * argv[]) {
	echo_ios_register_overlay_callbacks(
		&echo_ios_boot, &echo_ios_dismiss_overlay, &echo_ios_show_login);
	echo_ios_register_feature_callbacks(
		&echo_ios_sign_in_with_apple_sync, &echo_ios_register_push_sync);
	ffi::start_app();
	return 0;
}
