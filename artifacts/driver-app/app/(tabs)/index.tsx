import React, { useState, useEffect, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Modal,
  FlatList,
  ActivityIndicator,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import {
  useGetGpsDevices,
  useListProjects,
  useListTeamLeaders,
  useListDriverSessions,
  useStartDriverSession,
} from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";

type Colors = ReturnType<typeof useColors>;
type Insets = { top: number; bottom: number; left: number; right: number };
type ModalType = "date" | "driver" | "truck" | "project" | null;
type DateOption = { value: string; label: string; short: string };

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function recentDates(count = 30): DateOption[] {
  const DAYS   = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const result: DateOption[] = [];
  const base = new Date();
  for (let i = 0; i < count; i++) {
    const d = new Date(base);
    d.setDate(d.getDate() - i);
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const short = `${MONTHS[d.getMonth()]} ${d.getDate()}`;
    let label: string;
    if (i === 0)      label = `Today — ${short}`;
    else if (i === 1) label = `Yesterday — ${short}`;
    else              label = `${DAYS[d.getDay()]}, ${short}`;
    result.push({ value, label, short });
  }
  return result;
}

export default function ShiftScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();

  const dateOptions = useMemo(() => recentDates(30), []);

  const [selectedDate, setSelectedDate]       = useState<string>(todayStr);
  const [selectedDriver, setSelectedDriver]   = useState<string>("");
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>("");
  const [selectedProject, setSelectedProject] = useState<string>("");
  const [modalType, setModalType]             = useState<ModalType>(null);
  const [errorMsg, setErrorMsg]               = useState<string>("");
  const [successMsg, setSuccessMsg]           = useState<string>("");

  const { data: devices = [],     isLoading: devicesLoading  } = useGetGpsDevices();
  const { data: projects = [],    isLoading: projectsLoading } = useListProjects();
  const { data: teamLeaders = [], isLoading: leadersLoading  } = useListTeamLeaders();

  const { data: dateSessions = [], refetch: refetchSessions } = useListDriverSessions({
    from: selectedDate,
    to:   selectedDate,
  });

  useEffect(() => {
    const t = setInterval(() => refetchSessions(), 30000);
    return () => clearInterval(t);
  }, [refetchSessions]);

  const logMut = useStartDriverSession();

  const selectedDevice    = devices.find((d) => d.device_id === selectedDeviceId);
  const isLoading         = devicesLoading || projectsLoading || leadersLoading;
  const isReady           = !!selectedDriver && !!selectedDeviceId;

  const selectedDateOpt   = dateOptions.find((o) => o.value === selectedDate) ?? dateOptions[0];

  const alreadyLogged = useMemo(
    () =>
      dateSessions.some(
        (s) => s.driver_name === selectedDriver && s.device_id === selectedDeviceId,
      ),
    [dateSessions, selectedDriver, selectedDeviceId],
  );

  const pickerData = useMemo<string[]>(() => {
    if (modalType === "date")    return dateOptions.map((o) => o.label);
    if (modalType === "driver")  return teamLeaders.map((t) => t.name);
    if (modalType === "truck")   return devices.map((d) => d.display_name);
    if (modalType === "project") return ["", ...projects.map((p) => p.project_number)];
    return [];
  }, [modalType, dateOptions, teamLeaders, devices, projects]);

  const handlePickerSelect = (value: string) => {
    if (modalType === "date") {
      const opt = dateOptions.find((o) => o.label === value);
      if (opt) setSelectedDate(opt.value);
    } else if (modalType === "driver") {
      setSelectedDriver(value);
    } else if (modalType === "truck") {
      const dev = devices.find((d) => d.display_name === value);
      setSelectedDeviceId(dev?.device_id ?? "");
    } else if (modalType === "project") {
      setSelectedProject(value);
    }
    setModalType(null);
    setErrorMsg("");
    setSuccessMsg("");
  };

  const handleSubmit = async () => {
    if (!isReady) return;
    setErrorMsg("");
    setSuccessMsg("");
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      await logMut.mutateAsync({
        data: {
          driver_name:    selectedDriver,
          device_id:      selectedDeviceId,
          project_number: selectedProject || "",
          shift_date:     selectedDate,
        },
      });
      await refetchSessions();
      setSuccessMsg(
        `Logged: ${selectedDriver} · ${selectedDevice?.display_name ?? selectedDeviceId}${selectedProject ? ` · ${selectedProject}` : ""} on ${selectedDateOpt.short}`,
      );
      setSelectedDriver("");
      setSelectedDeviceId("");
      setSelectedProject("");
    } catch {
      setErrorMsg("Failed to save. Check your connection and try again.");
    }
  };

  const s = makeStyles(colors, insets);
  const isPast = selectedDate !== todayStr();

  return (
    <View style={s.root}>
      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header */}
        <View style={s.header}>
          <View style={s.headerIcon}>
            <Feather name="truck" size={20} color={colors.primary} />
          </View>
          <Text style={s.headerTitle}>Truck Log</Text>
        </View>

        {/* Date card — prominent, full-width tap target */}
        <TouchableOpacity
          style={[s.dateCard, isPast && s.dateCardPast]}
          onPress={() => setModalType("date")}
          activeOpacity={0.75}
          testID="select-date"
        >
          <View style={s.dateCardLeft}>
            <Feather name="calendar" size={20} color={isPast ? "#F59E0B" : colors.primary} />
            <View>
              <Text style={[s.dateCardLabel, isPast && s.dateCardLabelPast]}>
                {selectedDateOpt.label}
              </Text>
              {isPast && (
                <Text style={s.dateCardSub}>Backdating — tap to change</Text>
              )}
            </View>
          </View>
          <Feather name="chevron-down" size={18} color={isPast ? "#F59E0B" : colors.mutedForeground} />
        </TouchableOpacity>

        {/* Assignment form */}
        <View style={s.section}>
          <Text style={s.sectionLabel}>ASSIGN TRUCK</Text>

          {isLoading ? (
            <ActivityIndicator color={colors.primary} style={{ marginVertical: 24 }} />
          ) : (
            <>
              <TouchableOpacity
                style={[s.selectorCard, !!selectedDriver && s.selectorCardActive]}
                onPress={() => setModalType("driver")}
                activeOpacity={0.75}
                testID="select-driver"
              >
                <View style={[s.selectorIconBox, !!selectedDriver && s.selectorIconBoxActive]}>
                  <Feather name="user" size={18} color={selectedDriver ? colors.primary : colors.mutedForeground} />
                </View>
                <View style={s.selectorText}>
                  <Text style={s.selectorHint}>Driver</Text>
                  <Text style={[s.selectorVal, !selectedDriver && s.selectorValEmpty]}>
                    {selectedDriver || "Select driver…"}
                  </Text>
                </View>
                <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
              </TouchableOpacity>

              <TouchableOpacity
                style={[s.selectorCard, !!selectedDeviceId && s.selectorCardActive]}
                onPress={() => setModalType("truck")}
                activeOpacity={0.75}
                testID="select-truck"
              >
                <View style={[s.selectorIconBox, !!selectedDeviceId && s.selectorIconBoxActive]}>
                  <Feather name="truck" size={18} color={selectedDeviceId ? colors.primary : colors.mutedForeground} />
                </View>
                <View style={s.selectorText}>
                  <Text style={s.selectorHint}>Truck</Text>
                  <Text style={[s.selectorVal, !selectedDeviceId && s.selectorValEmpty]}>
                    {selectedDevice?.display_name ?? "Select truck…"}
                  </Text>
                </View>
                <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
              </TouchableOpacity>

              <TouchableOpacity
                style={[s.selectorCard, !!selectedProject && s.selectorCardActive]}
                onPress={() => setModalType("project")}
                activeOpacity={0.75}
                testID="select-project"
              >
                <View style={[s.selectorIconBox, !!selectedProject && s.selectorIconBoxActive]}>
                  <Feather name="briefcase" size={18} color={selectedProject ? colors.primary : colors.mutedForeground} />
                </View>
                <View style={s.selectorText}>
                  <Text style={s.selectorHint}>Project</Text>
                  <Text style={[s.selectorVal, !selectedProject && s.selectorValEmpty]}>
                    {selectedProject || "Optional"}
                  </Text>
                </View>
                <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
              </TouchableOpacity>
            </>
          )}
        </View>

        {/* Duplicate warning */}
        {alreadyLogged && isReady && (
          <View style={s.warnBanner}>
            <Feather name="alert-triangle" size={14} color="#F59E0B" />
            <Text style={s.warnText}>
              Already logged for this driver + truck on {selectedDateOpt.short}
            </Text>
          </View>
        )}

        {/* Feedback */}
        {errorMsg ? (
          <View style={s.errorBanner}>
            <Feather name="alert-circle" size={14} color="#EF4444" />
            <Text style={s.errorText}>{errorMsg}</Text>
          </View>
        ) : successMsg ? (
          <View style={s.successBanner}>
            <Feather name="check-circle" size={14} color="#10B981" />
            <Text style={s.successText}>{successMsg}</Text>
          </View>
        ) : null}

        {/* Submit */}
        <TouchableOpacity
          style={[s.submitBtn, !isReady && s.submitBtnDisabled]}
          onPress={handleSubmit}
          disabled={!isReady || logMut.isPending}
          activeOpacity={0.85}
          testID="submit-btn"
        >
          {logMut.isPending ? (
            <ActivityIndicator color="#0F1923" />
          ) : (
            <>
              <Feather name="check" size={20} color={isReady ? "#0F1923" : colors.mutedForeground} />
              <Text style={[s.submitBtnText, !isReady && s.submitBtnTextDisabled]}>Log Day</Text>
            </>
          )}
        </TouchableOpacity>

        {/* Logged entries for selected date */}
        {dateSessions.length > 0 && (
          <View style={s.section}>
            <Text style={s.sectionLabel}>
              {isPast ? `LOGGED FOR ${selectedDateOpt.short.toUpperCase()}` : "LOGGED TODAY"}
            </Text>
            {dateSessions.map((sess) => (
              <View key={sess.id} style={s.entryRow}>
                <View style={s.entryDot} />
                <View style={s.entryInfo}>
                  <Text style={s.entryDriver}>{sess.driver_name}</Text>
                  <Text style={s.entryMeta}>
                    {devices.find((d) => d.device_id === sess.device_id)?.display_name ?? sess.device_id}
                    {sess.project_number ? ` · ${sess.project_number}` : ""}
                  </Text>
                </View>
                <Feather name="check-circle" size={16} color="#10B981" />
              </View>
            ))}
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Picker modal */}
      <Modal
        visible={modalType !== null}
        animationType="slide"
        transparent
        presentationStyle="pageSheet"
        onRequestClose={() => setModalType(null)}
      >
        <View style={s.modalBg}>
          <View style={s.modalSheet}>
            <View style={s.modalHandle} />
            <View style={s.modalHead}>
              <Text style={s.modalTitle}>
                {modalType === "date"
                  ? "Select Date"
                  : modalType === "driver"
                    ? "Select Driver"
                    : modalType === "truck"
                      ? "Select Truck"
                      : "Select Project"}
              </Text>
              <TouchableOpacity onPress={() => setModalType(null)} style={s.modalCloseBtn}>
                <Feather name="x" size={20} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>
            <FlatList
              data={pickerData}
              keyExtractor={(item, i) => `${item}_${i}`}
              renderItem={({ item }) => {
                let selected = false;
                if (modalType === "date")    selected = item === selectedDateOpt.label;
                if (modalType === "driver")  selected = item === selectedDriver;
                if (modalType === "truck")   selected = item === (selectedDevice?.display_name ?? "");
                if (modalType === "project") selected = item === selectedProject;
                return (
                  <TouchableOpacity
                    style={[s.pickerRow, selected && s.pickerRowSelected]}
                    onPress={() => handlePickerSelect(item)}
                    activeOpacity={0.7}
                  >
                    <Text style={[s.pickerText, selected && s.pickerTextSelected]}>
                      {item || "(None)"}
                    </Text>
                    {selected && <Feather name="check" size={16} color={colors.primary} />}
                  </TouchableOpacity>
                );
              }}
              contentContainerStyle={{ padding: 12, paddingBottom: insets.bottom + 24 }}
              showsVerticalScrollIndicator={false}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}

function makeStyles(c: Colors, insets: Insets) {
  const webTop = Platform.OS === "web" ? 67 : 0;
  const webBot = Platform.OS === "web" ? 34 : 0;

  return StyleSheet.create({
    root: { flex: 1, backgroundColor: c.background },
    scroll: { flex: 1 },
    scrollContent: {
      paddingTop: insets.top + webTop + 16,
      paddingBottom: insets.bottom + webBot + 24,
      paddingHorizontal: 20,
    },

    header: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      marginBottom: 20,
    },
    headerIcon: {
      width: 40,
      height: 40,
      borderRadius: 12,
      backgroundColor: c.card,
      alignItems: "center",
      justifyContent: "center",
    },
    headerTitle: {
      fontSize: 24,
      fontFamily: "Inter_700Bold",
      color: c.foreground,
      letterSpacing: -0.5,
    },

    dateCard: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      backgroundColor: c.card,
      borderRadius: 18,
      paddingVertical: 20,
      paddingHorizontal: 20,
      marginBottom: 20,
      borderWidth: 1.5,
      borderColor: c.primary + "50",
    },
    dateCardPast: { borderColor: "#F59E0B50", backgroundColor: "#F59E0B08" },
    dateCardLeft: { flexDirection: "row", alignItems: "center", gap: 14 },
    dateCardLabel: {
      fontSize: 18,
      fontFamily: "Inter_700Bold",
      color: c.foreground,
      letterSpacing: -0.3,
    },
    dateCardLabelPast: { color: "#F59E0B" },
    dateCardSub: {
      fontSize: 11,
      fontFamily: "Inter_400Regular",
      color: "#F59E0B",
      marginTop: 2,
      opacity: 0.8,
    },

    section: { marginBottom: 16 },
    sectionLabel: {
      fontSize: 10,
      fontFamily: "Inter_600SemiBold",
      color: c.mutedForeground,
      letterSpacing: 1.5,
      marginBottom: 10,
    },

    selectorCard: {
      flexDirection: "row",
      alignItems: "center",
      gap: 14,
      backgroundColor: c.card,
      borderRadius: 14,
      padding: 16,
      marginBottom: 10,
      borderWidth: 1,
      borderColor: c.border,
    },
    selectorCardActive: { borderColor: c.primary + "40" },
    selectorIconBox: {
      width: 40,
      height: 40,
      borderRadius: 10,
      backgroundColor: c.secondary,
      alignItems: "center",
      justifyContent: "center",
    },
    selectorIconBoxActive: { backgroundColor: c.primary + "20" },
    selectorText: { flex: 1 },
    selectorHint: {
      fontSize: 10,
      fontFamily: "Inter_500Medium",
      color: c.mutedForeground,
      marginBottom: 2,
    },
    selectorVal: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: c.foreground },
    selectorValEmpty: { color: c.mutedForeground, fontFamily: "Inter_400Regular" },

    warnBanner: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      backgroundColor: "#F59E0B15",
      borderRadius: 12,
      paddingHorizontal: 16,
      paddingVertical: 12,
      marginBottom: 12,
      borderWidth: 1,
      borderColor: "#F59E0B40",
    },
    warnText: { fontSize: 13, fontFamily: "Inter_400Regular", color: "#F59E0B", flex: 1 },

    errorBanner: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      backgroundColor: "#EF444420",
      borderRadius: 12,
      paddingHorizontal: 16,
      paddingVertical: 12,
      marginBottom: 16,
      borderWidth: 1,
      borderColor: "#EF444440",
    },
    errorText: { fontSize: 13, fontFamily: "Inter_400Regular", color: "#EF4444", flex: 1 },
    successBanner: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      backgroundColor: "#10B98120",
      borderRadius: 12,
      paddingHorizontal: 16,
      paddingVertical: 12,
      marginBottom: 16,
      borderWidth: 1,
      borderColor: "#10B98140",
    },
    successText: { fontSize: 13, fontFamily: "Inter_400Regular", color: "#10B981", flex: 1 },

    submitBtn: {
      backgroundColor: c.primary,
      borderRadius: 18,
      height: 60,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 10,
      marginBottom: 24,
    },
    submitBtnDisabled: { backgroundColor: c.secondary, borderWidth: 1, borderColor: c.border },
    submitBtnText: {
      fontSize: 17,
      fontFamily: "Inter_700Bold",
      color: "#0F1923",
      letterSpacing: -0.3,
    },
    submitBtnTextDisabled: { color: c.mutedForeground },

    entryRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      backgroundColor: c.card,
      borderRadius: 12,
      padding: 14,
      marginBottom: 8,
      borderWidth: 1,
      borderColor: c.border,
    },
    entryDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: "#10B981",
    },
    entryInfo: { flex: 1 },
    entryDriver: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: c.foreground },
    entryMeta: { fontSize: 12, fontFamily: "Inter_400Regular", color: c.mutedForeground, marginTop: 2 },

    modalBg: {
      flex: 1,
      justifyContent: "flex-end",
      backgroundColor: "rgba(0,0,0,0.5)",
    },
    modalSheet: {
      backgroundColor: c.background,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      maxHeight: "75%",
      borderWidth: 1,
      borderColor: c.border,
      borderBottomWidth: 0,
    },
    modalHandle: {
      width: 36,
      height: 4,
      borderRadius: 2,
      backgroundColor: c.border,
      alignSelf: "center",
      marginTop: 12,
      marginBottom: 4,
    },
    modalHead: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 20,
      paddingVertical: 16,
      borderBottomWidth: 1,
      borderColor: c.border,
    },
    modalTitle: { fontSize: 18, fontFamily: "Inter_700Bold", color: c.foreground },
    modalCloseBtn: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: c.secondary,
      alignItems: "center",
      justifyContent: "center",
    },
    pickerRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingVertical: 16,
      paddingHorizontal: 12,
      borderRadius: 12,
      marginBottom: 4,
    },
    pickerRowSelected: { backgroundColor: c.primary + "15" },
    pickerText: { fontSize: 16, fontFamily: "Inter_400Regular", color: c.foreground },
    pickerTextSelected: { fontFamily: "Inter_600SemiBold", color: c.primary },
  });
}
