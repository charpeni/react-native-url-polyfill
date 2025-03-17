package com.urlpolyfill;

import androidx.annotation.NonNull;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.module.annotations.ReactModule;

#ifdef RCT_NEW_ARCH_ENABLED
import com.facebook.react.turbomodule.core.interfaces.TurboModule;
#endif

@ReactModule(name = URLPolyfillModule.NAME)
public class URLPolyfillModule extends #ifdef RCT_NEW_ARCH_ENABLED NativeURLPolyfillSpec #else ReactContextBaseJavaModule #endif {
    public static final String NAME = "URLPolyfill";

    public URLPolyfillModule(ReactApplicationContext reactContext) {
        super(reactContext);
    }

    @Override
    @NonNull
    public String getName() {
        return NAME;
    }

    @Override
    public boolean canOverrideExistingModule() {
        return true;
    }
}
