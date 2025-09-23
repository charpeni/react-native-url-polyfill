import {NativeModules} from 'react-native';
import {URL as whatwgUrl} from 'whatwg-url-without-unicode';

let BLOB_URL_PREFIX = null;

const NativeBlobModule = NativeModules.BlobModule;

if (
  NativeBlobModule &&
  typeof NativeBlobModule.getConstants().BLOB_URI_SCHEME === 'string'
) {
  const constants = NativeBlobModule.getConstants();
  BLOB_URL_PREFIX = constants.BLOB_URI_SCHEME + ':';
  if (typeof constants.BLOB_URI_HOST === 'string') {
    BLOB_URL_PREFIX += `//${constants.BLOB_URI_HOST}/`;
  }
}

/*
 * To allow Blobs be accessed via `content://` URIs,
 * you need to register `BlobProvider` as a ContentProvider in your app's `AndroidManifest.xml`:
 *
 * ```xml
 * <manifest>
 *   <application>
 *     <provider
 *       android:name="com.facebook.react.modules.blob.BlobProvider"
 *       android:authorities="@string/blob_provider_authority"
 *       android:exported="false"
 *     />
 *   </application>
 * </manifest>
 * ```
 * And then define the `blob_provider_authority` string in `res/values/strings.xml`.
 * Use a dotted name that's entirely unique to your app:
 *
 * ```xml
 * <resources>
 *   <string name="blob_provider_authority">your.app.package.blobs</string>
 * </resources>
 * ```
 */

whatwgUrl.createObjectURL = function createObjectURL(blob) {
  if (BLOB_URL_PREFIX === null) {
    throw new Error('Cannot create URL for blob!');
  }
  return `${BLOB_URL_PREFIX}${blob.data.blobId}?offset=${blob.data.offset}&size=${blob.size}`;
};

whatwgUrl.revokeObjectURL = function revokeObjectURL(url) {
  // Do nothing.
};

whatwgUrl.canParse = function canParse(url, base) {
  try {
    // eslint-disable-next-line no-new
    new URL(url, base);
    return true;
  } catch {
    return false;
  }
};

export const URL = whatwgUrl;
